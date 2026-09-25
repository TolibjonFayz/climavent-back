import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { MailerService } from '@nestjs-modules/mailer';
import { QueryTypes, Transaction } from 'sequelize';
import { OtpService } from 'src/otp/otp.service';
import { pushToStoreAdmins } from 'src/deliveries/push';
import { pushQuoteReady, pushQuoteTimeout, pushQuoteUpdated } from 'src/deliveries/customer-push';
import {
  pushQuoteAccepted,
  pushQuoteRejected,
  pushQuoteRequest,
  pushQuoteRequestAgain,
  pushQuoteRequestReminder,
} from 'src/deliveries/store-push';
import { Order } from './model/order.model';
import { OrderQuote, QuoteItem } from './model/order-quote.model';
import { OrderEvent, recordOrderEvent } from './order-events';
import { emitOrderUpdated } from './order-signal';
import { refreshJobAmounts } from 'src/service_jobs/service-orders';
import { AcceptQuoteDto, RejectQuoteDto, SendQuoteDto } from './dto/quote.dto';
import { defaultValidUntil, isQuoteExpired, quoteDueAt } from './quote-sla';
import {
  ensureSections,
  markReady,
  publicSection,
  QuoteSection,
  SECTION_REMIND_MS,
  SECTION_TIMEOUT_MS,
  sectionsOf,
} from './quote-sections';

const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://climavent.uz').replace(/\/+$/, '');

/** Adminka so'rovchisi: do'kon tokeni bo'lmasa — servis kaliti / sayt admini. */
export interface QuoteSender {
  store_id: number | null;
  user_id: number | null;
  login: string | null;
  is_super: boolean;
}

export const quoteSender = (req: any): QuoteSender => {
  const su = req?.storeUser;
  const isStoreAdmin = su?.role === 'store_admin';
  return {
    store_id: isStoreAdmin ? Number(su.store_id) : null,
    user_id: su?.user_id ?? null,
    login: su?.login ?? null,
    is_super: !isStoreAdmin,
  };
};

interface ItemRow {
  id: number;
  store_id: number | null;
  quantity: number;
  price: string | number | null;
  product_model: string | null;
  name: string | null;
}

/**
 * KP (narx taklifi) oqimi — topshiriq №25.
 *
 * Asosiy g'oya: KP alohida mijoz turi yoki alohida savat EMAS. Bu
 * buyurtmaning bir turi (`kind: quote`) — farqi shundaki, narxni sotuvchi
 * beradi. Mijoz qabul qilsa, o'sha buyurtma oddiy buyurtmaga aylanadi.
 *
 * Nega shunday: ilgari `quote_sent` holati bor edi, lekin KP ning O'ZI
 * (narxlar, amal muddati, shartlar) tizimda yo'q edi — hammasi telefon va
 * Telegramda davom etardi.
 */
@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    @InjectModel(Order) private readonly orderRepo: typeof Order,
    @InjectModel(OrderQuote) private readonly quoteRepo: typeof OrderQuote,
    private readonly sms: OtpService,
    @Optional() private readonly mailer?: MailerService,
  ) {}

  // ============================================================ 2-band: sotuvchi KP yuboradi
  async send(orderId: number, dto: SendQuoteDto, sender: QuoteSender) {
    const order = await this.orderRepo.findByPk(orderId);
    if (!order) throw new NotFoundException('Buyurtma topilmadi');
    if (order.kind !== 'quote') {
      throw new ConflictException("KP faqat narx so'rovi (kind: quote) uchun yuboriladi");
    }
    // Qayta yuborish = yangi versiya, shuning uchun `quote_sent` ham ruxsat.
    if (!['new', 'quote_sent'].includes(order.status)) {
      throw new ConflictException(`${order.status} holatidagi buyurtmaga KP yuborib bo'lmaydi`);
    }

    const rows = await this.itemsOf(orderId);
    const byId = new Map(rows.map((r) => [Number(r.id), r]));

    const seen = new Set<number>();
    const stores = new Set<number>();
    for (const line of dto.items) {
      const row = byId.get(Number(line.order_item_id));
      if (!row) throw new BadRequestException(`order_item_id ${line.order_item_id} bu buyurtmada yo'q`);
      if (seen.has(row.id)) throw new BadRequestException(`order_item_id ${row.id} ikki marta yuborilgan`);
      seen.add(row.id);
      if (row.store_id === null) {
        throw new BadRequestException(`order_item_id ${row.id}: mahsulot do'koni noma'lum`);
      }
      // Aralash buyurtmada do'kon admini FAQAT o'z qatorlariga narx qo'yadi
      if (!sender.is_super && Number(row.store_id) !== sender.store_id) {
        throw new ForbiddenException(`order_item_id ${row.id} sizning do'koningizga tegishli emas`);
      }
      stores.add(Number(row.store_id));
    }
    if (stores.size !== 1) {
      throw new BadRequestException("Bitta KP — bitta do'kon qatorlari uchun (har do'kon o'z KP sini yuboradi)");
    }
    const storeId = [...stores][0];

    // Shu do'konning HAMMA qatoriga narx qo'yilishi kerak: yarim KP
    // mijozga hech narsa aytmaydi.
    const storeRows = rows.filter((r) => Number(r.store_id) === storeId);
    const missing = storeRows.filter((r) => !seen.has(r.id));
    if (missing.length) {
      throw new BadRequestException(
        `Narxsiz qolgan qatorlar: ${missing.map((r) => r.id).join(', ')} — hammasiga narx qo'ying`,
      );
    }

    const validUntil = dto.valid_until ? String(dto.valid_until).slice(0, 10) : defaultValidUntil();
    if (isQuoteExpired(validUntil)) {
      throw new BadRequestException("valid_until o'tmishda bo'lmasin");
    }

    // Bo'limlar (№33): shu yuborishdan OLDIN birorta bo'lim tayyormidi —
    // xaridorga `quote_ready` (birinchi) yoki `quote_updated` ketishini belgilaydi.
    const seq = this.orderRepo.sequelize;
    await ensureSections(seq, orderId);
    const wasAnyReady = (await sectionsOf(seq, orderId)).some((x) => x.state === 'ready');

    const priceOf = new Map(dto.items.map((i) => [Number(i.order_item_id), Number(i.price)]));
    const quoteItems: QuoteItem[] = storeRows.map((r) => ({
      order_item_id: r.id,
      name: r.name,
      model: r.product_model,
      quantity: Number(r.quantity),
      price: priceOf.get(r.id)!,
    }));

    const quote = await this.orderRepo.sequelize.transaction(async (t) => {
      // Versiya — shu buyurtma + do'kon uchun. Ikki operator bir vaqtda
      // yuborsa ikkalasi ham 2-versiya bo'lib qolmasin, shuning uchun
      // avval BUYURTMA qatori qulflanadi.
      //
      // DIQQAT: `MAX(...) FOR UPDATE` Postgres'da ishlamaydi
      // ("FOR UPDATE is not allowed with aggregate functions") — qulf
      // agregatsiz so'rovda bo'lishi kerak.
      await this.orderRepo.sequelize.query(`SELECT id FROM orders WHERE id = :order FOR UPDATE`, {
        replacements: { order: orderId },
        type: QueryTypes.SELECT,
        transaction: t,
      });
      const [last]: any[] = await this.orderRepo.sequelize.query(
        `SELECT COALESCE(MAX(version), 0) AS v FROM order_quotes
          WHERE order_id = :order AND store_id = :store`,
        { replacements: { order: orderId, store: storeId }, type: QueryTypes.SELECT, transaction: t },
      );
      const version = Number(last?.v || 0) + 1;

      for (const line of quoteItems) {
        await this.orderRepo.sequelize.query(
          `UPDATE "order-items" SET price = :price, "updatedAt" = now() WHERE id = :id`,
          { replacements: { price: line.price, id: line.order_item_id }, transaction: t },
        );
      }
      const created = await this.quoteRepo.create(
        {
          order_id: orderId,
          store_id: storeId,
          version,
          items: quoteItems,
          valid_until: validUntil,
          delivery_terms: dto.delivery_terms?.trim() || null,
          payment_terms: dto.payment_terms?.trim() || null,
          note: dto.note?.trim() || null,
          sent_by: sender.user_id,
          sent_at: new Date(),
        } as any,
        { transaction: t },
      );

      await this.recomputeTotal(orderId, t);

      // Topshiriq №33: holat `quote_sent` — BIRORTA bo'lim tayyor bo'lganda
      // (ilgari butun buyurtma narxlanganda edi). Bu yuborish shu do'kon
      // bo'limini albatta tayyor qiladi: uning hamma qatoriga narx yozildi.
      if (order.status !== 'quote_sent') {
        await this.orderRepo.update(
          { status: 'quote_sent' } as any,
          { where: { id: orderId }, transaction: t },
        );
      }
      await recordOrderEvent({
        order_id: orderId,
        event: 'quote_sent',
        from_status: order.status,
        to_status: 'quote_sent',
        actor_type: sender.is_super ? 'superadmin' : 'store',
        actor_id: sender.user_id,
        note: `v${version}, amal muddati ${validUntil}`,
        transaction: t,
      });
      return created;
    });

    const sections = await sectionsOf(seq, orderId);
    await markReady(seq, orderId, sections);
    // SMS FAQAT birinchi tayyor bo'limda (tekshiruv 21.09): qayta yuborilgan
    // versiya yoki keyingi bo'lim — push, SMS emas.
    await this.notifySections(orderId, sections, {
      firstReady: !wasAnyReady,
      sms: !wasAnyReady && order.status !== 'quote_sent',
    });
    return {
      quote: quote.get({ plain: true }),
      status: 'quote_sent',
      order_id: orderId,
      quote_sections: sections.map(publicSection),
    };
  }


  // ============================================================ №28: saytda KP darhol
  /**
   * Savatdan olingan KP ning **v1 versiyasi** (topshiriq №28, 1-band).
   *
   * Nega kerak: narxi saytda BOR mahsulot uchun ham mijoz 1 ish kuni
   * kutardi. Endi sayt narxlarini o'sha zahoti KP qilib beramiz.
   *
   * Topshiriq №33: v1 faqat HAMMA qatori narxlangan do'kon bo'limi uchun
   * yaratiladi — narxsiz qator hujjatga tushmaydi. Qolgan bo'limlar
   * "narx kutilmoqda" (`quote_sections`) va do'konga so'rov ochiladi.
   *
   * Narxlar `order_items.price` dan olinadi — ular qator qo'shilganda
   * `OrderPricingService` tomonidan AYNAN mijoz ko'rgan qoida bilan
   * (aksiya + joriy kurs) hisoblangan.
   *
   * SMS **ketmaydi**: mijoz KP ni ekranda ko'rib turibdi (push ketadi).
   */
  async issueSiteQuote(orderId: number, actor: { id?: number | null; is_admin?: boolean } = {}) {
    const order = await this.orderRepo.findByPk(orderId);
    if (!order) throw new NotFoundException('Buyurtma topilmadi');
    if (order.kind !== 'quote') {
      throw new ConflictException("KP faqat narx so'rovi (kind: quote) uchun yaratiladi");
    }
    if (!['new', 'quote_sent'].includes(order.status)) {
      throw new ConflictException(`${order.status} holatidagi buyurtmaga KP yaratib bo'lmaydi`);
    }
    const already = await this.quoteRepo.count({ where: { order_id: orderId } });
    if (already) {
      throw new ConflictException("Bu buyurtma uchun KP allaqachon yaratilgan");
    }

    const rows = await this.itemsOf(orderId);
    if (!rows.length) throw new BadRequestException("Buyurtmada qator yo'q");
    const unknown = rows.filter((r) => r.store_id === null);
    if (unknown.length) {
      throw new BadRequestException(`Do'koni noma'lum qatorlar: ${unknown.map((r) => r.id).join(', ')}`);
    }

    const byStore = new Map<number, ItemRow[]>();
    for (const r of rows) {
      const k = Number(r.store_id);
      if (!byStore.has(k)) byStore.set(k, []);
      byStore.get(k)!.push(r);
    }
    const validUntil = defaultValidUntil();
    const allPriced = rows.every((r) => r.price !== null);
    // Topshiriq №33, 2-qaror: narxsiz qator HUJJATGA TUSHMAYDI. v1 faqat hamma
    // qatori narxlangan do'kon bo'limi uchun yaratiladi; qolganlari
    // "narx kutilmoqda" bo'lib turadi va do'kon narx yozganda qo'shiladi.
    const readyStores = [...byStore].filter(([, storeRows]) => storeRows.every((r) => r.price !== null));
    const seq = this.orderRepo.sequelize;

    const created = await seq.transaction(async (t) => {
      const made: OrderQuote[] = [];
      for (const [storeId, storeRows] of readyStores) {
        made.push(
          await this.quoteRepo.create(
            {
              order_id: orderId,
              store_id: storeId,
              version: 1,
              items: storeRows.map((r) => ({
                order_item_id: r.id,
                name: r.name,
                model: r.product_model,
                quantity: Number(r.quantity),
                price: Number(r.price),
              })),
              valid_until: validUntil,
              delivery_terms: null,
              payment_terms: null,
              note: null,
              // Avtomatik: hech bir xodim yubormagan
              sent_by: null,
              sent_at: new Date(),
            } as any,
            { transaction: t },
          ),
        );
      }
      await ensureSections(seq, orderId, t);
      await this.recomputeTotal(orderId, t);
      const anyReady = readyStores.length > 0;
      if (anyReady && order.status !== 'quote_sent') {
        await this.orderRepo.update({ status: 'quote_sent' } as any, { where: { id: orderId }, transaction: t });
      }
      await recordOrderEvent({
        order_id: orderId,
        event: 'quote_sent',
        from_status: order.status,
        to_status: anyReady ? 'quote_sent' : order.status,
        actor_type: 'system',
        actor_id: null,
        note: anyReady
          ? `Saytda avtomatik (v1, ${readyStores.length}/${byStore.size} bo'lim), amal muddati ${validUntil}`
          : "Saytda: narxlar do'kondan kutilmoqda",
        transaction: t,
      });
      return made;
    });

    const sections = await sectionsOf(seq, orderId);
    await markReady(seq, orderId, sections);

    // Narxsiz bo'lim — do'konga aniq so'rov (umumiy "yangi KP so'rovi"
    // push'i bu oqimda yuborilmaydi, ikki marta bezovta qilmaslik uchun).
    for (const [storeId, storeRows] of byStore) {
      const need = storeRows.filter((r) => r.price === null).length;
      if (!need) continue;
      // Topshiriq №31: Hamkor ilovasi `quote_request` turini kutadi
      await pushQuoteRequest(orderId, storeId, need);
    }
    // Tayyor bo'lim bo'lsa — xaridorga `quote_ready` (№33, tekshirish 1).
    // SMS yo'q: xaridor KP ni ekranda ko'rib turibdi.
    if (readyStores.length) await this.notifySections(orderId, sections, { firstReady: true, sms: false });

    return {
      order_id: orderId,
      status: readyStores.length ? 'quote_sent' : order.status,
      all_priced: allPriced,
      quotes: created.map((q) => q.get({ plain: true })),
      quote_sections: sections.map(publicSection),
    };
  }

  /** Narxsiz modellarga talab (topshiriq №28, 2-band). */
  async unpricedDemand(storeId: number | null) {
    const rep: any = {};
    let cond = '';
    if (storeId) {
      cond = 'AND p.store_id = :store';
      rep.store = storeId;
    }
    const rows: any[] = await this.orderRepo.sequelize.query(
      `SELECT i.product_id,
              i.product_model_id,
              COALESCE(p.name_uz, p.name_ru, p.name_en) AS name,
              -- MODEL NOMI (topshiriq №30): modelli qatorda characteristic
              -- sarlavhasi, modelsizda buyurtma paytidagi nom. Mahsulot
              -- RAQAMI hech qachon model o'rnida qaytmaydi: eski qatorlarda
              -- product_model ga mahsulot id si yozilib qolgan
              -- ("158", "170") va Hamkor ilovasi uni model nomi deb
              -- o'qishga majbur bo'lgan.
              CASE
                WHEN c.title IS NOT NULL THEN c.title
                WHEN i.product_model IS NULL THEN NULL
                WHEN btrim(i.product_model) IN ('', '-') THEN NULL
                WHEN btrim(i.product_model) = i.product_id::text THEN NULL
                ELSE i.product_model
              END AS model,
              p.store_id,
              COUNT(DISTINCT i.order_id)::int AS requests,
              MAX(o."createdAt") AS last_requested_at
         FROM "order-items" i
         JOIN orders o ON o.id = i.order_id
         LEFT JOIN products p ON p.id = i.product_id
         LEFT JOIN characteristics c ON c.id = i.product_model_id
        WHERE i.price IS NULL AND o.kind = 'quote' AND i.item_type = 'product' ${cond}
        GROUP BY i.product_id, i.product_model_id, p.name_uz, p.name_ru, p.name_en,
                 c.title, i.product_model, p.store_id
        ORDER BY requests DESC, last_requested_at DESC
        LIMIT 200`,
      { replacements: rep, type: QueryTypes.SELECT },
    );
    return rows.map((r) => ({
      ...r,
      product_id: r.product_id === null ? null : Number(r.product_id),
      product_model_id: r.product_model_id === null ? null : Number(r.product_model_id),
      requests: Number(r.requests),
    }));
  }

  // ============================================================ 3-band: mijoz qabul qiladi / rad etadi
  /**
   * Xaridor KP ni qabul qiladi (№25, 3-band; №33, 4-band).
   *
   * Qabul qilinadigani — HUJJAT: barcha TAYYOR bo'limlar. Narxi hali
   * kelmagan (yoki muddati o'tgan) bo'limlar shu buyurtmada QOLMAYDI — ular
   * yangi DAVOMI buyurtmaga ko'chadi (`parent_order_id`), u `kind: quote`
   * bo'lib qoladi va do'kon narx yozganda xaridorga alohida KP bo'lib keladi.
   *
   * Nega bitta buyurtma ichida "qabul qilingan bo'limlar ro'yxati" emas:
   * qabul qilingan buyurtma to'lov, yetkazish va summa bilan yashaydi —
   * ichida narxsiz qatorlar qolsa summa noma'lum bo'lib qolardi va
   * yetkazish/hisobotlar har joyda "qisman qabul" ni hisobga olishi kerak edi.
   *
   * `dto.quote_ids` — xaridor ko'rgan (qabul qilayotgan) KP versiyalari.
   * Ular hozirgi tayyor bo'limlarning oxirgi versiyalariga teng bo'lmasa
   * (yangi bo'lim qo'shildi yoki narx yangilandi) — 409, sahifani yangilasin.
   */
  async accept(orderId: number, dto: AcceptQuoteDto, requester: { id?: number; is_admin?: boolean }) {
    const order = await this.ownedOrder(orderId, requester);
    const seq = this.orderRepo.sequelize;
    const quotes = await this.quotesOf(orderId);

    await ensureSections(seq, orderId);
    const sections = await sectionsOf(seq, orderId);
    const ready = sections.filter((x) => x.state === 'ready');
    // Tayyor bo'lim yo'q — sabab TUSHUNARLI bo'lishi uchun holat tekshiruvidan OLDIN
    if (!ready.length) {
      const unpriced = sections.reduce((n, x) => n + x.unpriced_count, 0);
      if (!unpriced && !quotes.length) throw new ConflictException('Bu buyurtma uchun KP yuborilmagan');
      throw new ConflictException(
        `Sotuvchi hali narx bermagan (${unpriced} ta qator) — KP tayyor bo'lganda xabar keladi`,
      );
    }
    if (order.status !== 'quote_sent') {
      throw new ConflictException(`${order.status} holatidagi KP ni qabul qilib bo'lmaydi`);
    }

    const readyQuotes = ready.map((x) => quotes.find((q) => q.id === x.quote_id)).filter(Boolean) as OrderQuote[];
    const maxVersion = Math.max(...readyQuotes.map((q) => q.version));
    if (Number(dto.version) !== maxVersion) {
      throw new ConflictException(
        `KP yangilangan (joriy versiya ${maxVersion}) — sahifani yangilab, qayta ko'rib chiqing`,
      );
    }
    if (dto.quote_ids?.length) {
      const want = [...new Set(dto.quote_ids.map(Number))].sort((a, b) => a - b).join(',');
      const have = readyQuotes
        .map((q) => q.id)
        .sort((a, b) => a - b)
        .join(',');
      if (want !== have) {
        throw new ConflictException(
          `KP yangilangan (tayyor bo'limlar: ${have}) — sahifani yangilab, qayta ko'rib chiqing`,
        );
      }
    }
    if (readyQuotes.some((q) => isQuoteExpired(q.valid_until))) {
      throw new ConflictException("KP eskirgan, yangisini so'rang");
    }

    const pending = sections.filter((x) => x.state !== 'ready');
    const pendingStores = pending.map((x) => x.store_id);
    const followupId = await seq.transaction(async (t) => {
      let childId: number | null = null;
      if (pendingStores.length) {
        const src: any = order.get({ plain: true });
        const child = await this.orderRepo.create(
          {
            user_id: src.user_id,
            status: 'new',
            kind: 'quote',
            source: src.source ?? null,
            location: src.location,
            lat: src.lat ?? null,
            lng: src.lng ?? null,
            comment: src.comment ?? null,
            company_name: dto.company_name?.trim() || src.company_name || null,
            company_tin: dto.company_tin?.trim() || src.company_tin || null,
            recipient_name: src.recipient_name ?? null,
            recipient_phone: src.recipient_phone ?? null,
            address_details: src.address_details ?? null,
            region_code: src.region_code ?? null,
            district_code: src.district_code ?? null,
            parent_order_id: orderId,
            totalAmount: null,
          } as any,
          { transaction: t },
        );
        childId = child.id;
        const rep = { order: orderId, child: childId, stores: pendingStores };
        // Qatorlar, bo'limlar (muddat sanog'i bilan) va shu do'konlarning
        // eski KP versiyalari davomi buyurtmaga ko'chadi.
        await seq.query(
          `UPDATE "order-items" SET order_id = :child, "updatedAt" = now()
            WHERE order_id = :order AND store_id IN (:stores)`,
          { replacements: rep, transaction: t },
        );
        // Xizmat ishi (№39) qatorlari bilan birga ko'chadi
        await seq.query(
          `UPDATE service_jobs SET order_id = :child, updated_at = now()
            WHERE order_id = :order AND store_id IN (:stores)`,
          { replacements: rep, transaction: t },
        );
        await seq.query(
          `UPDATE order_quote_sections SET order_id = :child WHERE order_id = :order AND store_id IN (:stores)`,
          { replacements: rep, transaction: t },
        );
        await seq.query(
          `UPDATE order_quotes SET order_id = :child WHERE order_id = :order AND store_id IN (:stores)`,
          { replacements: rep, transaction: t },
        );
        await this.recomputeTotal(childId, t);
        await recordOrderEvent({
          order_id: childId,
          event: 'created',
          to_status: 'new',
          actor_type: 'customer',
          actor_id: requester?.id ?? null,
          note: `#${orderId} davomi: narxi kutilayotgan qism`,
          transaction: t,
        });
      }

      await this.orderRepo.update(
        {
          // `kind` faqat SHU yo'l bilan quote -> order bo'ladi (№21 dagi
          // "o'zgarmaydi" qoidasiga yagona istisno).
          kind: 'order',
          status: 'new',
          quote_accepted_at: new Date(),
          quote_accepted_version: maxVersion,
          ...(dto.company_name ? { company_name: dto.company_name.trim() } : {}),
          ...(dto.company_tin ? { company_tin: dto.company_tin.trim() } : {}),
        } as any,
        { where: { id: orderId }, transaction: t },
      );
      for (const q of readyQuotes) {
        await seq.query(
          `UPDATE order_quote_sections SET accepted_at = now(), accepted_version = :v
            WHERE order_id = :order AND store_id = :store`,
          { replacements: { v: q.version, order: orderId, store: q.store_id }, transaction: t },
        );
      }
      await this.recomputeTotal(orderId, t);
      // Xizmat ishlari (№39): KP da yozilgan narx ishning summasiga ham tushadi
      await refreshJobAmounts(seq, orderId, t);
      await recordOrderEvent({
        order_id: orderId,
        event: 'quote_accepted',
        from_status: 'quote_sent',
        to_status: 'new',
        actor_type: 'customer',
        actor_id: requester?.id ?? null,
        note: `v${maxVersion}` + (childId ? `; narxsiz qism davomi #${childId} ga ajratildi` : ''),
        transaction: t,
      });
      return childId;
    });

    // Narxsiz qismi davomiga ko'chgan do'konlarning ro'yxatidan bu buyurtma
    // yo'qoladi — ular ham signal olsin (№36; davomi `created` hodisasi bilan keladi).
    if (pendingStores.length) emitOrderUpdated(orderId, { extraStores: pendingStores });
    await pushQuoteAccepted(orderId, [...new Set(readyQuotes.map((q) => q.store_id))]);
    // Narx kutayotgan do'konlar endi DAVOMI buyurtmaning narxini yozadi —
    // eski push'dagi raqam bo'yicha ular qatorlarini topolmaydi.
    if (followupId) {
      for (const x of pending) {
        if (x.unpriced_count > 0) await pushQuoteRequest(followupId, x.store_id, x.unpriced_count);
      }
    }

    return {
      order_id: orderId,
      kind: 'order',
      status: 'new',
      accepted_version: maxVersion,
      accepted_quote_ids: readyQuotes.map((q) => q.id),
      followup_order_id: followupId,
      message: followupId
        ? `KP qabul qilindi — narxi kutilayotgan qism #${followupId} ga ajratildi`
        : 'KP qabul qilindi — buyurtma rasmiylashtirildi',
    };
  }

  async reject(orderId: number, dto: RejectQuoteDto, requester: { id?: number; is_admin?: boolean }) {
    const order = await this.ownedOrder(orderId, requester);
    if (order.status !== 'quote_sent') {
      throw new ConflictException(`${order.status} holatidagi KP ni rad etib bo'lmaydi`);
    }
    const reason = dto.reason?.trim() || null;
    await this.orderRepo.sequelize.transaction(async (t) => {
      await this.orderRepo.update(
        { status: 'cancelled', quote_reject_reason: reason } as any,
        { where: { id: orderId }, transaction: t },
      );
      await recordOrderEvent({
        order_id: orderId,
        event: 'quote_rejected',
        from_status: 'quote_sent',
        to_status: 'cancelled',
        actor_type: 'customer',
        actor_id: requester?.id ?? null,
        note: reason,
        transaction: t,
      });
    });
    const storeIds = [...new Set((await this.quotesOf(orderId)).map((q) => q.store_id))];
    await pushQuoteRejected(orderId, storeIds, reason);
    return { order_id: orderId, status: 'cancelled', reason };
  }

  /** Eskirgan KP — mijoz yangisini so'raydi (holat yana `new`, sotuvchiga push). */
  async requestAgain(orderId: number, requester: { id?: number; is_admin?: boolean }) {
    const order = await this.ownedOrder(orderId, requester);
    if (order.status !== 'quote_sent') {
      throw new ConflictException(`${order.status} holatida yangi KP so'rab bo'lmaydi`);
    }
    const latest = this.latestPerStore(await this.quotesOf(orderId));
    if (!latest.length) throw new ConflictException('Bu buyurtma uchun KP yuborilmagan');
    if (!latest.some((q) => isQuoteExpired(q.valid_until))) {
      throw new ConflictException("Joriy KP hali amalda — uni qabul qiling yoki rad eting");
    }

    await this.orderRepo.sequelize.transaction(async (t) => {
      await this.orderRepo.update({ status: 'new' } as any, { where: { id: orderId }, transaction: t });
      await recordOrderEvent({
        order_id: orderId,
        event: 'quote_requested_again',
        from_status: 'quote_sent',
        to_status: 'new',
        actor_type: 'customer',
        actor_id: requester?.id ?? null,
        note: "Mijoz yangi KP so'radi",
        transaction: t,
      });
    });
    await pushQuoteRequestAgain(orderId, [...new Set(latest.map((q) => q.store_id))]);
    return { order_id: orderId, status: 'new' };
  }

  // ============================================================ 5-band: SLA va hisobot
  /**
   * KP hisoboti: o'rtacha javob vaqti (ish soatlari emas, astronomik —
   * adminkada "qancha kutdi" ko'rsatiladi), KP -> buyurtma ulushi,
   * do'konlar kesimi.
   */
  async stats(storeId: number | null, q: { date_from?: string; date_to?: string } = {}) {
    const cond: string[] = [`o.kind = 'quote' OR o.quote_accepted_at IS NOT NULL`];
    const rep: any = {};
    if (storeId) {
      cond.push(
        `EXISTS (SELECT 1 FROM "order-items" i WHERE i.order_id = o.id AND i.store_id = :store)`,
      );
      rep.store = storeId;
    }
    if (q.date_from && !isNaN(Date.parse(q.date_from))) {
      cond.push('o."createdAt" >= :from');
      rep.from = new Date(q.date_from);
    }
    if (q.date_to && !isNaN(Date.parse(q.date_to))) {
      cond.push('o."createdAt" <= :to');
      rep.to = new Date(q.date_to);
    }
    const W = cond.map((c) => `(${c})`).join(' AND ');
    const sel = (sql: string) =>
      this.orderRepo.sequelize.query(sql, { replacements: rep, type: QueryTypes.SELECT }) as Promise<any[]>;

    const [totals] = await sel(`
      SELECT COUNT(*)::int AS requests,
             COUNT(*) FILTER (WHERE q.first_sent_at IS NOT NULL)::int AS answered,
             COUNT(*) FILTER (WHERE o.quote_accepted_at IS NOT NULL)::int AS accepted,
             COUNT(*) FILTER (WHERE o.status = 'cancelled' AND o.quote_reject_reason IS NOT NULL)::int AS rejected,
             COUNT(*) FILTER (WHERE o.source = 'site_kp')::int AS site_kp_count,
             COUNT(*) FILTER (WHERE o.source = 'site_kp' AND o.quote_accepted_at IS NOT NULL)::int AS site_kp_accepted,
             ROUND(AVG(EXTRACT(EPOCH FROM (q.first_sent_at - o."createdAt")) / 3600)::numeric, 2) AS avg_response_hours
        FROM orders o
        LEFT JOIN LATERAL (SELECT MIN(sent_at) AS first_sent_at FROM order_quotes WHERE order_id = o.id) q ON true
       WHERE ${W}`);

    const stores = await sel(`
      SELECT s.id AS store_id, s.name,
             COUNT(DISTINCT oq.order_id)::int AS quotes_sent,
             COUNT(DISTINCT oq.order_id) FILTER (WHERE o.quote_accepted_at IS NOT NULL)::int AS accepted
        FROM order_quotes oq
        JOIN orders o ON o.id = oq.order_id
        JOIN stores s ON s.id = oq.store_id
       WHERE ${W} GROUP BY s.id, s.name ORDER BY quotes_sent DESC`);

    const requests = Number(totals?.requests || 0);
    const accepted = Number(totals?.accepted || 0);
    return {
      requests,
      answered: Number(totals?.answered || 0),
      accepted,
      rejected: Number(totals?.rejected || 0),
      // Saytda nechta KP chiqarildi va nechtasi buyurtmaga aylandi (№28)
      site_kp_count: Number(totals?.site_kp_count || 0),
      site_kp_accepted: Number(totals?.site_kp_accepted || 0),
      avg_response_hours: totals?.avg_response_hours === null ? null : Number(totals.avg_response_hours),
      conversion: requests ? Math.round((accepted / requests) * 1000) / 1000 : null,
      stores: stores.map((s) => ({
        ...s,
        conversion: s.quotes_sent ? Math.round((s.accepted / s.quotes_sent) * 1000) / 1000 : null,
      })),
    };
  }

  // ============================================================ o'qish uchun
  /** Buyurtmaning KP versiyalari (adminka va mijoz uchun bir xil). */
  async quotesOf(orderId: number): Promise<OrderQuote[]> {
    return this.quoteRepo.findAll({ where: { order_id: orderId }, order: [['id', 'ASC']] });
  }

  async eventsOf(orderId: number): Promise<OrderEvent[]> {
    return OrderEvent.findAll({ where: { order_id: orderId }, order: [['id', 'ASC']] });
  }

  /** `?kind=quote` ro'yxati uchun javob muddati (topshiriq №25, 5-band). */
  dueAt(createdAt: Date | string) {
    return quoteDueAt(createdAt);
  }

  // ============================================================ ichki
  private latestPerStore(quotes: OrderQuote[]) {
    const best = new Map<number, OrderQuote>();
    for (const q of quotes) {
      const cur = best.get(q.store_id);
      if (!cur || q.version > cur.version) best.set(q.store_id, q);
    }
    return [...best.values()];
  }

  private async ownedOrder(orderId: number, requester: { id?: number; is_admin?: boolean }) {
    const order = await this.orderRepo.findByPk(orderId);
    // Begona buyurtma — 404 (borligini ham bildirmaymiz)
    if (!order || (!requester?.is_admin && Number(order.user_id) !== Number(requester?.id))) {
      throw new NotFoundException('Buyurtma topilmadi');
    }
    return order;
  }

  private async itemsOf(orderId: number, t?: Transaction): Promise<ItemRow[]> {
    return this.orderRepo.sequelize.query(
      `SELECT i.id, i.quantity, i.price, i.product_model, COALESCE(i.store_id, p.store_id) AS store_id,
              COALESCE(p.name_uz, p.name_ru, p.name_en, i.product_model) AS name
         FROM "order-items" i LEFT JOIN products p ON p.id = i.product_id
        WHERE i.order_id = :order ORDER BY i.id`,
      { replacements: { order: orderId }, type: QueryTypes.SELECT, transaction: t },
    ) as Promise<ItemRow[]>;
  }

  /**
   * Summa qatorlar yig'indisidan. Bitta qatorning narxi noma'lum bo'lsa
   * summa ham noma'lum (`OrderPricingService.recomputeOrderTotal` bilan
   * bir xil qoida — bu yerda SQL, chunki tranzaksiya ichida turibmiz).
   */
  private async recomputeTotal(orderId: number, t: Transaction) {
    await this.orderRepo.sequelize.query(
      `UPDATE orders SET "totalAmount" = sub.total FROM (
         SELECT CASE WHEN COUNT(*) > 0 AND COUNT(*) = COUNT(price)
                     THEN SUM(price * quantity) END AS total
           FROM "order-items" WHERE order_id = :order
       ) sub WHERE orders.id = :order`,
      { replacements: { order: orderId }, transaction: t },
    );
  }

  /**
   * Bo'lim tayyor bo'ldi — xaridorga push (topshiriq №33, 1-band).
   *
   *   birinchi tayyor bo'lim (yoki bitta do'konli buyurtma) — `quote_ready`
   *     (+ SMS/e-pochta, `sms` bo'lsa);
   *   keyingi bo'lim / tayyor bo'limning yangi versiyasi — `quote_updated`.
   * Bitta do'konli buyurtmada `quote_updated` ketmaydi.
   */
  private async notifySections(orderId: number, sections: QuoteSection[], opts: { firstReady: boolean; sms: boolean }) {
    const ready = sections.filter((x) => x.state === 'ready').length;
    const total = sections.length;
    if (!ready) return;
    if (opts.firstReady || total <= 1) {
      await this.notifyCustomer(orderId, { sms: opts.sms, kind: 'ready', ready, total });
    } else {
      await this.notifyCustomer(orderId, { sms: false, kind: 'updated', ready, total });
    }
  }

  // ============================================================ №33, 2-band: eslatma va muddat
  /**
   * Fon ishi (`QuoteSectionJobs`, 10 daqiqada bir):
   *   4 soat  — bo'lim hali narxsiz: do'konga `quote_request_reminder`;
   *   24 soat — bo'lim `timeout`: xaridorga `quote_timeout`, bo'lim KP dan tushadi.
   * Belgilash `UPDATE ... WHERE ... IS NULL RETURNING` bilan — ikki nusxa
   * (replika) bir vaqtda ishlasa ham push bir marta ketadi.
   */
  async sweepSections(now: Date = new Date(), only?: { orderIds?: number[] }) {
    const seq = this.orderRepo.sequelize;
    // Xavfsizlik to'ri: bo'limi yo'q ochiq KP lar (masalan qatorlar
    // boshqa yo'l bilan qo'shilgan) — so'ralgan vaqt = buyurtma vaqti.
    await seq.query(
      `INSERT INTO order_quote_sections (order_id, store_id, requested_at)
       SELECT DISTINCT o.id, i.store_id, o."createdAt"
         FROM orders o
         JOIN "order-items" i ON i.order_id = o.id
        WHERE o.kind = 'quote' AND o.status IN ('new', 'quote_sent')
          AND o."createdAt" > :since AND i.store_id IS NOT NULL
       ON CONFLICT (order_id, store_id) DO NOTHING`,
      { replacements: { since: new Date(now.getTime() - 3 * SECTION_TIMEOUT_MS) } },
    );
    const due: any[] = await seq.query(
      `SELECT s.id, s.order_id, s.store_id, s.requested_at, s.reminded_at, s.timed_out_at, o.user_id
         FROM order_quote_sections s JOIN orders o ON o.id = s.order_id
        WHERE s.accepted_at IS NULL AND s.ready_at IS NULL
          AND o.kind = 'quote' AND o.status IN ('new', 'quote_sent')
          AND ((s.reminded_at IS NULL AND s.requested_at < :remind)
            OR (s.timed_out_at IS NULL AND s.requested_at < :timeout))
          ${only?.orderIds ? 'AND s.order_id IN (:only)' : ''}
        ORDER BY s.id LIMIT 200`,
      {
        replacements: {
          // Faqat sinov: haqiqiy buyurtmalarga tegmaslik uchun
          only: only?.orderIds?.length ? only.orderIds : [0],
          remind: new Date(now.getTime() - SECTION_REMIND_MS),
          timeout: new Date(now.getTime() - SECTION_TIMEOUT_MS),
        },
        type: QueryTypes.SELECT,
      },
    );
    const result = { reminded: 0, timed_out: 0 };
    const cache = new Map<number, QuoteSection[]>();
    for (const row of due) {
      try {
        const orderId = Number(row.order_id);
        if (!cache.has(orderId)) cache.set(orderId, await sectionsOf(seq, orderId));
        const sections = cache.get(orderId)!;
        const sec = sections.find((x) => x.store_id === Number(row.store_id));
        if (!sec) continue;
        if (sec.state === 'ready') {
          await markReady(seq, orderId, sections);
          continue;
        }
        const age = now.getTime() - new Date(row.requested_at).getTime();
        if (age >= SECTION_TIMEOUT_MS && !row.timed_out_at) {
          const [marked]: any = await seq.query(
            `UPDATE order_quote_sections SET timed_out_at = :now, reminded_at = COALESCE(reminded_at, :now)
              WHERE id = :id AND timed_out_at IS NULL RETURNING id`,
            { replacements: { id: row.id, now }, type: QueryTypes.SELECT },
          );
          if (!marked) continue;
          result.timed_out++;
          await recordOrderEvent({
            order_id: orderId,
            event: 'quote_section_timeout',
            actor_type: 'system',
            actor_id: null,
            // Izoh xaridorga ham ko'rinadi — do'kon ko'rsatilmaydi (№33, 1-qaror)
            note: `24 soatda narx berilmadi (${sec.unpriced_count} ta qator)`,
          });
          await pushQuoteTimeout(
            orderId,
            row.user_id,
            sec.unpriced_count || sec.item_count,
            sections.some((x) => x.state === 'ready'),
          );
        } else if (age >= SECTION_REMIND_MS && !row.reminded_at) {
          const [marked]: any = await seq.query(
            `UPDATE order_quote_sections SET reminded_at = :now
              WHERE id = :id AND reminded_at IS NULL RETURNING id`,
            { replacements: { id: row.id, now }, type: QueryTypes.SELECT },
          );
          if (!marked) continue;
          result.reminded++;
          const hoursLeft = Math.max(1, Math.round((SECTION_TIMEOUT_MS - age) / 3_600_000));
          await pushQuoteRequestReminder(orderId, sec.store_id, sec.unpriced_count || sec.item_count, hoursLeft);
        }
      } catch (e) {
        this.logger.warn(`KP bo'limi (#${row.order_id}, do'kon ${row.store_id}): ${(e as Error).message}`);
      }
    }
    if (result.reminded || result.timed_out) {
      this.logger.log(`KP bo'limlari: ${result.reminded} ta eslatma, ${result.timed_out} ta muddat o'tdi`);
    }
    return result;
  }

  /** Bo'limlar (xaridor/adminka javobi uchun). */
  async sectionsFor(orderId: number) {
    return sectionsOf(this.orderRepo.sequelize, orderId);
  }

  /** KP tayyor/yangilandi: push har safar; SMS va e-pochta faqat `quote_ready` da. */
  private async notifyCustomer(
    orderId: number,
    opts: { sms: boolean; kind: 'ready' | 'updated'; ready: number; total: number },
  ) {
    const [row]: any[] = await this.orderRepo.sequelize.query(
      `SELECT u.id AS user_id, u.phone_number, u.email, u.name
         FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = :id`,
      { replacements: { id: orderId }, type: QueryTypes.SELECT },
    );
    if (!row) return;

    // Push HAR SAFAR ketadi (topshiriq №29, 4-band): SMS pullik va faqat
    // birinchi tayyor KP da yuboriladi, push esa bepul.
    if (opts.kind === 'updated') {
      await pushQuoteUpdated(orderId, row.user_id, opts.ready, opts.total);
      return;
    }
    await pushQuoteReady(orderId, row.user_id, opts.ready, opts.total);
    const link = `${SITE_URL}/profile/orders/${orderId}`;
    // SMS havolasi — **protokolsiz qisqa yo'l** `/p/:id` (sayt uni
    // `/profile/orders/:id` ga yo'naltiradi). Shablon #90540 aynan shunday.
    const smsLink = `${SITE_URL.replace(/^https?:\/\//, '')}/p/${orderId}`;
    if (opts.sms && /^\+998\d{9}$/.test(String(row.phone_number || ''))) {
      // Eskiz shabloni **#90540** — harfma-harf:
      //   Climavent: #%d so'rovingiz bo'yicha KP tayyor. Ko'rish: climavent.uz/p/%d
      try {
        const res: any = await this.sms.sendSms(
          row.phone_number,
          `Climavent: #${orderId} so'rovingiz bo'yicha KP tayyor. Ko'rish: ${smsLink}`,
        );
        if (res !== true) this.logger.warn(`KP SMS yuborilmadi (#${orderId}): ${res?.message || res?.status}`);
      } catch (e) {
        this.logger.warn(`KP SMS xatosi (#${orderId}): ${(e as Error).message}`);
      }
    }
    if (this.mailer && row.email) {
      try {
        await this.mailer.sendMail({
          to: row.email,
          subject: `Climavent: #${orderId} buyurtma bo'yicha narx taklifi`,
          text: `Assalomu alaykum${row.name ? `, ${row.name}` : ''}!\n\n#${orderId} so'rovingiz bo'yicha narx taklifi tayyor.\nKo'rish: ${link}\n\nHurmat bilan, Climavent`,
        });
      } catch (e) {
        this.logger.warn(`KP xati yuborilmadi (#${orderId}): ${(e as Error).message}`);
      }
    }
  }
}
