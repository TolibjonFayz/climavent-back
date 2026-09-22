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
import { pushQuoteReady } from 'src/deliveries/customer-push';
import { Order } from './model/order.model';
import { OrderQuote, QuoteItem } from './model/order-quote.model';
import { OrderEvent, recordOrderEvent } from './order-events';
import { AcceptQuoteDto, RejectQuoteDto, SendQuoteDto } from './dto/quote.dto';
import { defaultValidUntil, isQuoteExpired, quoteDueAt } from './quote-sla';

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

      // Buyurtmaning HAMMA qatoriga narx qo'yilgandagina holat `quote_sent`:
      // aralash buyurtmada ikkinchi do'kon hali javob bermagan bo'lishi mumkin.
      const fresh = await this.itemsOf(orderId, t);
      const allPriced = fresh.length > 0 && fresh.every((r) => r.price !== null);
      if (allPriced && order.status !== 'quote_sent') {
        await this.orderRepo.update(
          { status: 'quote_sent' } as any,
          { where: { id: orderId }, transaction: t },
        );
      }
      await recordOrderEvent({
        order_id: orderId,
        event: 'quote_sent',
        from_status: order.status,
        to_status: allPriced ? 'quote_sent' : order.status,
        actor_type: sender.is_super ? 'superadmin' : 'store',
        actor_id: sender.user_id,
        note: `v${version}, amal muddati ${validUntil}`,
        transaction: t,
      });
      return {
        created,
        allPriced,
        // Buyurtma BU chaqiruvdan oldin ham `quote_sent` bo'lgan bo'lsa,
        // mijoz KP haqida allaqachon xabardor — qayta SMS ketmaydi
        // (tekshiruv 21.09). Saytda darhol chiqqan KP (№28) ham shu yo'l
        // bilan jim qoladi: mijoz uni ekranda ko'rib turibdi.
        notifiedBefore: order.status === 'quote_sent',
      };
    });

    // SMS FAQAT birinchi to'liq KP da (tekshiruv 21.09): qayta yuborilgan
    // versiyada mijozga SMS ketmaydi — e-pochta ketaveradi.
    if (quote.allPriced) await this.notifyCustomer(orderId, { sms: !quote.notifiedBefore });
    return {
      quote: quote.created.get({ plain: true }),
      status: quote.allPriced ? 'quote_sent' : order.status,
      order_id: orderId,
    };
  }


  // ============================================================ №28: saytda KP darhol
  /**
   * Savatdan olingan KP ning **v1 versiyasi** (topshiriq №28, 1-band).
   *
   * Nega kerak: narxi saytda BOR mahsulot uchun ham mijoz 1 ish kuni
   * kutardi. Endi sayt narxlarini o'sha zahoti KP qilib beramiz; narxsiz
   * qatorlar `price: null` bo'lib qoladi va sotuvchiga so'rov ochiladi.
   *
   * Narxlar `order_items.price` dan olinadi — ular qator qo'shilganda
   * `OrderPricingService` tomonidan AYNAN mijoz ko'rgan qoida bilan
   * (aksiya + joriy kurs) hisoblangan.
   *
   * SMS **ketmaydi**: mijoz KP ni ekranda ko'rib turibdi.
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

    const created = await this.orderRepo.sequelize.transaction(async (t) => {
      const made: OrderQuote[] = [];
      for (const [storeId, storeRows] of byStore) {
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
                // Narxsiz qator — jamiga qo'shilmaydi, sotuvchi to'ldiradi
                price: r.price === null ? null : Number(r.price),
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
      await this.recomputeTotal(orderId, t);
      if (allPriced && order.status !== 'quote_sent') {
        await this.orderRepo.update({ status: 'quote_sent' } as any, { where: { id: orderId }, transaction: t });
      }
      await recordOrderEvent({
        order_id: orderId,
        event: 'quote_sent',
        from_status: order.status,
        to_status: allPriced ? 'quote_sent' : order.status,
        actor_type: 'system',
        actor_id: null,
        note: `Saytda avtomatik (v1), amal muddati ${validUntil}`,
        transaction: t,
      });
      return made;
    });

    // Narxsiz qator bo'lsa — sotuvchiga aniq so'rov (umumiy "yangi KP
    // so'rovi" push'i bu oqimda yuborilmaydi, ikki marta bezovta qilmaslik uchun).
    if (!allPriced) {
      for (const [storeId, storeRows] of byStore) {
        const need = storeRows.filter((r) => r.price === null).length;
        if (!need) continue;
        await pushToStoreAdmins([storeId], {
          title: 'Mijoz KP oldi',
          body: `#${orderId}: mijoz KP oldi, ${need} ta qatorga narx kerak`,
          data: { type: 'site_quote_unpriced', order_id: orderId },
        });
      }
    }

    return {
      order_id: orderId,
      status: allPriced ? 'quote_sent' : order.status,
      all_priced: allPriced,
      quotes: created.map((q) => q.get({ plain: true })),
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
      `SELECT i.product_model_id,
              COALESCE(p.name_uz, p.name_ru, p.name_en) AS name,
              COALESCE(c.title, i.product_model) AS model,
              p.store_id,
              COUNT(DISTINCT i.order_id)::int AS requests,
              MAX(o."createdAt") AS last_requested_at
         FROM "order-items" i
         JOIN orders o ON o.id = i.order_id
         LEFT JOIN products p ON p.id = i.product_id
         LEFT JOIN characteristics c ON c.id = i.product_model_id
        WHERE i.price IS NULL AND o.kind = 'quote' ${cond}
        GROUP BY i.product_model_id, p.name_uz, p.name_ru, p.name_en, c.title, i.product_model, p.store_id
        ORDER BY requests DESC, last_requested_at DESC
        LIMIT 200`,
      { replacements: rep, type: QueryTypes.SELECT },
    );
    return rows.map((r) => ({ ...r, requests: Number(r.requests) }));
  }

  // ============================================================ 3-band: mijoz qabul qiladi / rad etadi
  async accept(orderId: number, dto: AcceptQuoteDto, requester: { id?: number; is_admin?: boolean }) {
    const order = await this.ownedOrder(orderId, requester);
    const quotes = await this.quotesOf(orderId);
    if (!quotes.length) throw new ConflictException('Bu buyurtma uchun KP yuborilmagan');

    // Topshiriq №28: saytda darhol chiqqan KP da narxsiz qator bo'lishi
    // mumkin — bunday buyurtma `new` holatida turadi. Sabab TUSHUNARLI
    // bo'lishi uchun bu tekshiruv holat tekshiruvidan OLDIN turadi
    // (aks holda mijoz "new holatidagi KP" degan xabarni ko'rardi).
    const rows = await this.itemsOf(orderId);
    const unpriced = rows.filter((r) => r.price === null);
    if (unpriced.length) {
      throw new ConflictException(
        `Sotuvchi hali narx bermagan (${unpriced.length} ta qator) — KP to'liq bo'lganda SMS keladi`,
      );
    }
    if (order.status !== 'quote_sent') {
      throw new ConflictException(`${order.status} holatidagi KP ni qabul qilib bo'lmaydi`);
    }

    // Har do'konning OXIRGI versiyasi. Mijoz eskirgan sahifada turgan
    // bo'lsa (sotuvchi yangi narx yuborgan) — 409.
    const latest = this.latestPerStore(quotes);
    const maxVersion = Math.max(...latest.map((q) => q.version));
    if (Number(dto.version) !== maxVersion) {
      throw new ConflictException(
        `KP yangilangan (joriy versiya ${maxVersion}) — sahifani yangilab, qayta ko'rib chiqing`,
      );
    }
    const expired = latest.find((q) => isQuoteExpired(q.valid_until));
    if (expired) {
      throw new ConflictException("KP eskirgan, yangisini so'rang");
    }

    await this.orderRepo.sequelize.transaction(async (t) => {
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
      await recordOrderEvent({
        order_id: orderId,
        event: 'quote_accepted',
        from_status: 'quote_sent',
        to_status: 'new',
        actor_type: 'customer',
        actor_id: requester?.id ?? null,
        note: `v${maxVersion}`,
        transaction: t,
      });
    });

    const storeIds = [...new Set(latest.map((q) => q.store_id))];
    await pushToStoreAdmins(storeIds, {
      title: 'KP qabul qilindi',
      body: `#${orderId}: mijoz KP ni qabul qildi`,
      data: { type: 'quote_accepted', order_id: orderId },
    });

    return {
      order_id: orderId,
      kind: 'order',
      status: 'new',
      accepted_version: maxVersion,
      message: 'KP qabul qilindi — buyurtma rasmiylashtirildi',
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
    await pushToStoreAdmins(storeIds, {
      title: 'KP rad etildi',
      body: `#${orderId}${reason ? `: ${reason}` : ''}`.slice(0, 180),
      data: { type: 'quote_rejected', order_id: orderId },
    });
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
    await pushToStoreAdmins([...new Set(latest.map((q) => q.store_id))], {
      title: "Yangi KP so'raldi",
      body: `#${orderId}: KP eskirgan, mijoz yangisini so'radi`,
      data: { type: 'quote_requested_again', order_id: orderId },
    });
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
        `EXISTS (SELECT 1 FROM "order-items" i JOIN products p ON p.id = i.product_id
                  WHERE i.order_id = o.id AND p.store_id = :store)`,
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
      `SELECT i.id, i.quantity, i.price, i.product_model, p.store_id,
              COALESCE(p.name_uz, p.name_ru, p.name_en) AS name
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

  /** KP tayyor: mijozga SMS va (bo'lsa) e-pochta. */
  private async notifyCustomer(orderId: number, opts: { sms: boolean } = { sms: true }) {
    const [row]: any[] = await this.orderRepo.sequelize.query(
      `SELECT u.id AS user_id, u.phone_number, u.email, u.name
         FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = :id`,
      { replacements: { id: orderId }, type: QueryTypes.SELECT },
    );
    if (!row) return;

    // Push HAR SAFAR ketadi (topshiriq №29, 4-band): SMS pullik va faqat
    // birinchi to'liq KP da yuboriladi, push esa bepul — ilova ochiq bo'lsa
    // xaridor KP yangilanganini ham darhol ko'radi.
    await pushQuoteReady(orderId, row.user_id);
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
