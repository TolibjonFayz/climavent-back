import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Order } from './model/order.model';
import { OrderItem } from 'src/order_items/model/order_item.model';
import { Product } from 'src/products/model/product.model';
import { User } from 'src/users/model/user.model';
import { ProductImages } from 'src/product_images/model/product_image.model';
import { Review } from 'src/reviews/model/review.model';
import { RequestActor } from 'src/guards/customer_or_backoffice.guard';
import {
  AUTO_ORDER_STATUSES,
  normalizeOrderStatus,
  ORDER_STATUS_MESSAGE,
} from './order-status';
import { BadRequestException } from '@nestjs/common';
import Sequelize, { Op } from 'sequelize';
import { cancelDeliveriesForOrder } from 'src/deliveries/deliveries.service';
import { Delivery } from 'src/deliveries/model/models';
import { pushOrderStatus } from 'src/deliveries/customer-push';
import { OrderItemsService } from 'src/order_items/order_items.service';
import { QuotesService } from './quotes.service';
import { OrderQuote } from './model/order-quote.model';
import { OrderEvent, publicOrderEvent, recordOrderEvent } from './order-events';
import { emitOrderUpdated, orderRecipients } from './order-signal';
import { quoteDueAt } from './quote-sla';
import { ensureSections, publicSection, sectionsOf } from './quote-sections';
import {
  assertOwnPhotoUrls,
  createServiceLinesAndJobs,
  customerWindow,
  prepareServiceLines,
  resolveArea,
} from 'src/service_jobs/service-orders';
import { CUSTOMER_PHOTOS_MAX, ServiceJob } from 'src/service_jobs/models';
import { backofficeJobView, customerJobView } from 'src/service_jobs/job-view';
import { cancelJobsForOrder } from 'src/service_jobs/jobs.service';
import { OrderStoreProgress, Stage, STAGE_TRANSITIONS, STAGES, storeStages, syncOrderStatus } from './order-progress';
import { orderTracking } from './order-tracking';
import type { StoreRequester } from 'src/store_auth/store_auth.guard';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order) private readonly OrderRepository: typeof Order,
    @InjectModel(OrderItem)
    private readonly OrderItemsRepository: typeof OrderItem,
    @InjectModel(Product)
    private readonly productRepository: typeof Product,
    private readonly orderItems: OrderItemsService,
    private readonly quotes: QuotesService,
  ) {}

  /**
   * KP so'rovi uchun javob muddati va KP versiyalari (topshiriq №25).
   * Har javobga bir xil qo'shiladi — adminka ham, sayt ham shu maydonlarni kutadi.
   */
  private async withQuoteInfo(plain: any, opts: { forCustomer?: boolean } = {}) {
    if (!plain) return plain;
    const quotes = await OrderQuote.findAll({ where: { order_id: plain.id }, order: [['id', 'ASC']] });
    plain.quotes = quotes.map((q) => q.get({ plain: true }));
    const events = await OrderEvent.findAll({ where: { order_id: plain.id }, order: [['id', 'ASC']] });
    // Mijozga `actor_id` berilmaydi — kim ishlaganini bilishi shart emas.
    plain.events = opts.forCustomer ? events.map(publicOrderEvent) : events.map((e) => e.get({ plain: true }));
    if (plain.kind === 'quote') plain.quote_due_at = quoteDueAt(plain.createdAt);

    // Topshiriq №33, 3-band: bo'lim holati SERVERDAN — ilova, sayt va
    // adminka taxmin qilmasin. Har `quote` ga o'z do'kon bo'limining holati
    // qo'shiladi; `quote_sections` — narxi hali kelmagan bo'limlar ham
    // (ularning `quote` i yo'q). Xaridorga do'kon NOMI berilmaydi.
    const sections = await sectionsOf(OrderQuote.sequelize, plain.id);
    const byStore = new Map(sections.map((x) => [x.store_id, x]));
    plain.quote_sections = sections.map(publicSection);
    for (const q of plain.quotes) {
      const sec = byStore.get(q.store_id);
      if (!sec) continue;
      const latest = sec.quote_id === q.id;
      q.state = latest ? sec.state : 'superseded';
      q.unpriced_count = latest ? sec.unpriced_count : null;
      q.requested_at = sec.requested_at;
      q.deadline_at = sec.deadline_at;
    }
    // 4-band: qabul qilinganda narxsiz qism ajratilgan davomi buyurtmalar
    const followups: any[] = await OrderQuote.sequelize.query(
      'SELECT id, kind, status FROM orders WHERE parent_order_id = :id ORDER BY id',
      { replacements: { id: plain.id }, type: 'SELECT' as any },
    );
    plain.followup_orders = followups;
    return plain;
  }

  //Creating a order
  //
  // `requester` — token egasi. Ilgari `user_id` tanadan TEKSHIRUVSIZ olinardi:
  // istalgan mijoz boshqa odam nomidan buyurtma (va №21 dan keyin KP so'rovi)
  // yarata olardi. Endi faqat o'z nomidan; sayt admini — istalgan.
  async createOrder(createOrderDto: CreateOrderDto, requester?: { id?: number; is_admin?: boolean }) {
    if (requester && !requester.is_admin && Number(createOrderDto.user_id) !== Number(requester.id)) {
      throw new ForbiddenException("Faqat o'z nomingizdan buyurtma bera olasiz");
    }
    const status = normalizeOrderStatus(createOrderDto.status);
    if (!status) throw new BadRequestException(ORDER_STATUS_MESSAGE);
    if (AUTO_ORDER_STATUSES.includes(status)) {
      throw new BadRequestException(`${status} holati avtomatik qo'yiladi — buyurtma new (yoki paid) bilan yaratiladi`);
    }
    const kind = createOrderDto.kind || 'order';
    if (status === 'quote_sent' && kind !== 'quote') {
      throw new BadRequestException("quote_sent holati faqat KP so'rovi (kind: quote) uchun");
    }
    const clean = (v?: string | null) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    // Qatorlar buyurtma yozuvining maydoni emas — ular alohida yaratiladi.
    // `service` — xizmat vaqti/izohi (№39), `address` — manzil bloki: yuqori
    // darajadagi maydon ustun, blokdagisi bo'sh joyni to'ldiradi.
    const { items: lines, service, address, ...orderFields } = createOrderDto as any;
    for (const [k, v] of Object.entries(address || {})) {
      if (v !== undefined && v !== null && (orderFields[k] === undefined || orderFields[k] === null)) orderFields[k] = v;
    }

    // Xizmat qatorlari (topshiriq №39, 4-band) — HAMMA tekshiruv buyurtma
    // yozilishidan OLDIN: hududdan tashqari xizmat (409) yarim buyurtma qoldirmasin.
    const allLines: any[] = Array.isArray(lines) ? lines : [];
    const productLines = allLines.map((l, index) => ({ ...l, index })).filter((l) => !l.service_id);
    const serviceInputs = allLines
      .map((l, index) => ({ ...l, index }))
      .filter((l) => l.service_id)
      .map((l) => ({
        index: l.index,
        service_id: Number(l.service_id),
        variant_id: Number(l.variant_id),
        quantity: Number(l.quantity),
        for_item_index: l.for_item_index ?? null,
      }));
    const area = resolveArea(orderFields.region_code, orderFields.district_code);
    orderFields.region_code = area.region_code;
    orderFields.district_code = area.district_code;
    const preparedServices = await prepareServiceLines(serviceInputs, {
      ...area,
      productIndexes: new Set(productLines.map((l) => l.index)),
    });
    if (preparedServices.length) {
      customerWindow(service);
      assertOwnPhotoUrls(service?.photos, CUSTOMER_PHOTOS_MAX);
    }

    const newOrder = await this.OrderRepository.create({
      ...orderFields,
      kind,
      // Topshiriq №28: KP qayerdan kelgani (`site_kp` — savatdan)
      source: createOrderDto.source ?? null,
      comment: clean(createOrderDto.comment),
      company_name: clean(createOrderDto.company_name),
      company_tin: clean(createOrderDto.company_tin),
      status,
      // Summani mijoz emas, SERVER hisoblaydi — qatorlar qo'shilganda
      // `OrderPricingService.recomputeOrderTotal` yozadi (topshiriq №13,
      // 4-band). Qatorsiz buyurtmaning summasi noma'lum.
      totalAmount: null,
    });
    await recordOrderEvent({
      order_id: newOrder.id,
      event: 'created',
      to_status: status,
      actor_type: requester?.is_admin ? 'superadmin' : 'customer',
      actor_id: requester?.id ?? null,
      note: kind === 'quote' ? "KP so'rovi" : null,
    });

    // Qatorlar shu yerda yaratiladi (topshiriq №28): sayt savatdan KP
    // olishda buyurtmani va qatorlarni BITTA so'rovda yuboradi va javobda
    // tayyor KP ni oladi. Narxni server aniqlaydi.
    const itemIdByIndex = new Map<number, number>();
    if (productLines.length) {
      for (const line of productLines) {
        const { index, service_id, variant_id, for_item_index, ...rest } = line;
        const created: any = await this.orderItems.createOrderItem({ ...rest, order_id: newOrder.id }, requester ?? {});
        itemIdByIndex.set(index, created.newOrderItem.id);
      }
      await newOrder.reload();
    }

    // Xizmat qatorlari va ishlar — har hamkor uchun bitta ish (№39, 4–5-band)
    let jobs: any[] = [];
    if (preparedServices.length) {
      jobs = await createServiceLinesAndJobs(newOrder, preparedServices, itemIdByIndex, service, {
        type: requester?.is_admin ? 'superadmin' : 'customer',
        id: requester?.id ?? null,
      });
      await this.orderItems.recomputeTotal(newOrder.id);
      // `quote` narxli xizmat — narxsiz qator: buyurtma KP so'roviga aylanadi (№21)
      if (preparedServices.some((x) => x.price === null) && newOrder.kind !== 'quote') {
        await this.OrderRepository.update({ kind: 'quote' } as any, { where: { id: newOrder.id }, silent: true });
        await recordOrderEvent({
          order_id: newOrder.id,
          event: 'status_changed',
          from_status: newOrder.status,
          to_status: newOrder.status,
          actor_type: requester?.is_admin ? 'superadmin' : 'customer',
          actor_id: requester?.id ?? null,
          note: "Narxsiz xizmat qatori — buyurtma KP so'roviga aylandi",
        });
      }
      await newOrder.reload();
      if (newOrder.kind === 'quote') await ensureSections(this.OrderRepository.sequelize, newOrder.id);
    }

    // Saytda chiqarilgan KP — v1 DARHOL yaratiladi, sotuvchi kutilmaydi.
    let quote: any = null;
    if (newOrder.kind === 'quote' && newOrder.source === 'site_kp' && Array.isArray(lines) && lines.length) {
      quote = await this.quotes.issueSiteQuote(newOrder.id, requester ?? {});
      await newOrder.reload();
    }

    const response: any = { message: 'Order successfully created', newOrder };
    if (jobs.length) response.jobs = jobs.map((j) => ({ id: j.id, store_id: j.store_id, status: j.status }));
    if (quote) {
      // Sayt KP sahifasini shundan chizadi
      response.quotes = quote.quotes;
      response.all_priced = quote.all_priced;
      response.quote_sections = quote.quote_sections;
    }
    return response;
  }

  // Get all orders.
  //
  // `storeId` berilsa (do'kon admini tokeni) — topshiriq №13, 6-band:
  //   - faqat o'sha do'kon mahsuloti BOR buyurtmalar qaytadi;
  //   - ularning ichidagi `orderItems` ham faqat o'sha do'konniki bo'ladi.
  // Aralash buyurtmada boshqa do'konning qatorlari ko'rinmaydi.
  //
  // `totalAmount` esa BUTUN buyurtmaniki bo'lib qoladi (qayta hisoblanmaydi)
  // — hozir bitta ham aralash buyurtma yo'q; bo'lganda do'kon ulushini
  // qatorlardan hisoblash kerak bo'ladi.
  async getAllOrders(storeId?: number | null, kind?: string, source?: string, stage?: string) {
    // `?kind=quote` — faqat KP so'rovlari (№21, 3-band)
    // `?source=site_kp` — faqat saytda chiqarilgan KP lar (№28, 2-band)
    const kindWhere: any = kind === 'order' || kind === 'quote' ? { kind } : {};
    if (source === 'site_kp' || source === 'manual') kindWhere.source = source;
    // KP so'roviga "1 ish kuni ichida javob bering" sanog'i (№25, 5-band).
    const withDue = (o: any) => {
      const plain = typeof o.get === 'function' ? o.get({ plain: true }) : o;
      if (plain.kind === 'quote') plain.quote_due_at = quoteDueAt(plain.createdAt);
      return plain;
    };
    // `?stage=waiting|packing|ready` (№38, 4-band). Yozuvi yo'q do'kon — `waiting`.
    const stageOk = stage && (STAGES as readonly string[]).includes(stage);
    if (stageOk) {
      const storeCond = storeId ? `AND i.store_id = ${Number(storeId)}` : '';
      kindWhere[Op.and] = [
        Sequelize.literal(
          `EXISTS (SELECT 1 FROM "order-items" i
                    LEFT JOIN order_store_progress p ON p.order_id = i.order_id AND p.store_id = i.store_id
                   WHERE i.order_id = "Order"."id" AND i.item_type = 'product' ${storeCond}
                     AND COALESCE(p.stage, 'waiting') = ${this.OrderRepository.sequelize.escape(stage)})`,
        ),
      ];
    }
    if (!storeId) {
      const rows = await this.OrderRepository.findAll({ where: kindWhere, include: { all: true } });
      const out = rows.map(withDue) as any[];
      await this.attachStages(out, null);
      return out;
    }

    const orders = await this.OrderRepository.findAll({
      where: {
        ...kindWhere,
        id: {
          [Op.in]: Sequelize.literal(
            `(SELECT DISTINCT order_id FROM "order-items" WHERE store_id = ${Number(storeId)})`,
          ),
        },
      },
      include: { all: true },
    });

    // Ichma-ich qatorlarni ham do'kon bo'yicha qisqartiramiz (xizmat qatori ham — №39).
    const out = orders.map((o) => {
      const plain: any = withDue(o);
      plain.orderItems = (plain.orderItems || []).filter((i: any) => Number(i.store_id) === Number(storeId));
      return plain;
    });
    await this.attachStages(out, Number(storeId));
    return out;
  }

  /**
   * Ro'yxatga yig'ish holati (№38, 4-band): do'kon tokeni bilan — shu
   * do'konning `stage` i (tovari yo'q bo'lsa `null`); superadmin — `stages`.
   */
  private async attachStages(rows: any[], storeId: number | null) {
    if (!rows.length) return;
    const ids = rows.map((r) => r.id);
    const found: any[] = await this.OrderRepository.sequelize.query(
      `SELECT DISTINCT i.order_id, i.store_id, COALESCE(p.stage, 'waiting') AS stage
         FROM "order-items" i
         LEFT JOIN order_store_progress p ON p.order_id = i.order_id AND p.store_id = i.store_id
        WHERE i.order_id IN (:ids) AND i.item_type = 'product' AND i.store_id IS NOT NULL
          ${storeId ? 'AND i.store_id = :store' : ''}`,
      { replacements: { ids, store: storeId }, type: 'SELECT' as any },
    );
    for (const r of rows) {
      const mine = found.filter((x) => Number(x.order_id) === Number(r.id));
      if (storeId) r.stage = mine[0]?.stage ?? null;
      else r.stages = mine.map((x) => ({ store_id: Number(x.store_id), stage: x.stage }));
    }
  }

  //Get order by id
  //
  // Ilgari istalgan tizimga kirgan mijoz BOSHQA odamning buyurtmasini (manzil,
  // summa, mahsulotlar) id bo'yicha ocha olardi. Endi faqat egasi yoki sayt admini;
  // begona buyurtma — 404 (borligini ham bildirmaymiz).
  async getOrderById(id: number, requester?: { id?: number; is_admin?: boolean }) {
    const order = await this.OrderRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (!order || (requester && !requester.is_admin && Number(order.user_id) !== Number(requester.id))) {
      throw new NotFoundException('Order not found or id is invalid');
    }
    // KP versiyalari va yo'l tarixi (topshiriq №25, 2- va 4-band)
    const plain = await this.withQuoteInfo(order.get({ plain: true }), {
      forCustomer: !requester?.is_admin,
    });
    // Xizmat ishlari (№39): vaqt, kod, narx tasdig'i, baho, kafolat
    const jobs = await ServiceJob.findAll({ where: { order_id: id }, order: [['id', 'ASC']] });
    plain.jobs = await Promise.all(jobs.map((j) => customerJobView(j)));
    return plain;
  }

  //Get order by userid
  async getOrderByUserId(id: number) {
    const userOrder = await this.OrderRepository.findAll({
      where: { user_id: id },
      include: [
        {
          model: OrderItem,
          include: [
            {
              model: Product,
              include: [
                {
                  model: ProductImages,
                },
                {
                  model: Review,
                },
              ],
            },
          ],
        },
        {
          model: User,
          attributes: ['name', 'region', 'city', 'adress'],
        },
      ],
      order: [['updatedAt', 'DESC']],
    });
    // Profildagi "Buyurtmalarim": KP kartochkasi uchun versiyalar va tarix
    return Promise.all(
      userOrder.map((o) => this.withQuoteInfo(o.get({ plain: true }), { forCustomer: true })),
    );
  }

  // Buyurtma egasini (yoki admin ekanini) tekshiradi
  /**
   * Buyurtmaga yozish huquqi (topshiriq №14, 2-band va 2-savol).
   *
   *   superadmin   — istalgan buyurtma (servis kaliti, sayt admini,
   *                  superadmin do'kon hisobi)
   *   store_admin  — faqat buyurtmadagi HAMMA qator o'z do'koniga
   *                  tegishli bo'lsa. Aralash buyurtmada bitta do'kon
   *                  boshqasining sotuvi holatini o'zgartira olmasligi
   *                  kerak.
   *   customer     — faqat o'z buyurtmasi (to'lov oqimi shunga tayanadi)
   */
  private async ensureCanWrite(id: number, actor: RequestActor) {
    const order = await this.OrderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found or something wrong');
    }

    if (actor?.kind === 'superadmin') return order;

    if (actor?.kind === 'store_admin') {
      const items = await this.OrderItemsRepository.findAll({
        where: { order_id: id },
        attributes: ['id', 'store_id'],
      });
      // `store_id` — tovar qatorida mahsulotdan, xizmat qatorida xizmatdan (№39)
      const storeIds = new Set(items.map((i) => i.store_id ?? null));
      // Bo'sh buyurtma yoki do'koni noma'lum qator bo'lsa — ruxsat yo'q.
      const hammasiMeniki =
        items.length > 0 &&
        storeIds.size === 1 &&
        storeIds.has(actor.store_id ?? null);
      if (!hammasiMeniki) {
        throw new ForbiddenException(
          "Bu buyurtmada boshqa do'kon mahsuloti ham bor — holatini " +
            "faqat superadmin o'zgartira oladi",
        );
      }
      return order;
    }

    // customer
    if (order.user_id !== actor?.user_id && !actor?.is_admin) {
      throw new ForbiddenException('Bu buyurtma sizga tegishli emas');
    }
    return order;
  }

  //Update order by id — mijoz (egasi), superadmin yoki do'kon admini
  async updateOrderById(
    id: number,
    updateOrderDto: UpdateOrderDto,
    actor: RequestActor,
  ) {
    const existing = await this.ensureCanWrite(id, actor);

    const payload: any = { ...updateOrderDto };
    // Summa qatorlardan hisoblanadi — to'g'ridan-to'g'ri yozib bo'lmaydi.
    delete payload.totalAmount;
    // Buyurtma turi va egasi yaratilgandan keyin o'zgarmaydi.
    delete payload.kind;

    // MIJOZ: faqat bekor qila oladi. Ilgari mijoz o'z buyurtmasini `paid` yoki
    // `done` qilib qo'ya olardi (soxta to'lov sahifasi shunga tayanardi).
    if (actor?.kind === 'customer' && !actor?.is_admin) {
      delete payload.user_id;
      if (payload.status !== undefined && normalizeOrderStatus(payload.status) !== 'cancelled') {
        throw new ForbiddenException("Mijoz buyurtmani faqat bekor qila oladi (status: cancelled)");
      }
    }
    // Holat qat'iy ro'yxatdan (topshiriq №14, 4-band). Eski o'zbekcha
    // nomlar hozircha qabul qilinadi va yangisiga aylantiriladi —
    // migratsiyagacha yozilgan mijozlar buzilmasin.
    if (payload.status !== undefined) {
      const normalized = normalizeOrderStatus(payload.status);
      if (!normalized) throw new BadRequestException(ORDER_STATUS_MESSAGE);
      // Yig'ish va ish holatlari faqat o'z endpointlari orqali (№38, №39)
      if (AUTO_ORDER_STATUSES.includes(normalized) && normalized !== existing.status) {
        throw new BadRequestException(
          `${normalized} holati qo'lda qo'yilmaydi: yig'ish — PATCH /orders/:id/stores/:storeId/stage, ish — usta ilovasi`,
        );
      }
      if (normalized === 'quote_sent' && existing.kind !== 'quote') {
        throw new BadRequestException("quote_sent holati faqat KP so'rovi (kind: quote) uchun");
      }
      payload.status = normalized;
    }

    const updated = await this.OrderRepository.update(payload, {
      where: { id: id },
      returning: true,
    });
    if (!updated[1][0]?.dataValues) throw new NotFoundException('Order not found or something wrong');

    if (payload.status !== undefined && payload.status !== existing.status) {
      // Xaridorga push (topshiriq №29, 4-band). O'ZI bekor qilgan bo'lsa
      // xabar bermaymiz — u buni ekranda ko'rib turadi.
      if (actor?.kind !== 'customer') {
        await pushOrderStatus(id, existing.user_id, payload.status);
      }
      await recordOrderEvent({
        order_id: id,
        event: 'status_changed',
        from_status: existing.status,
        to_status: payload.status,
        actor_type:
          actor?.kind === 'store_admin' ? 'store' : actor?.kind === 'customer' ? 'customer' : 'superadmin',
        actor_id: actor?.user_id ?? null,
      });
    }

    // Buyurtma bekor qilindi — faol yetkazishlar ham bekor, kuryerga push (№22, 3-band)
    if (payload.status === 'cancelled' && existing.status !== 'cancelled') {
      await cancelDeliveriesForOrder(id, {
        type: actor?.kind === 'store_admin' ? 'store' : actor?.kind === 'customer' ? 'system' : 'superadmin',
        id: actor?.user_id ?? null,
      });
      // Xizmat ishlari ham (№39) — ustaga push
      await cancelJobsForOrder(id, {
        type: actor?.kind === 'store_admin' ? 'store' : actor?.kind === 'customer' ? 'customer' : 'superadmin',
        id: actor?.user_id ?? null,
      });
    }
    // Holatsiz tahrir (manzil, izoh, kompaniya...) tarixga yozilmaydi — signal
    // shu yerdan (№36). Holat o'zgargan bo'lsa hodisa bilan birlashadi.
    emitOrderUpdated(id);
    return updated[1][0].dataValues;
  }

  /**
   * Adminka: bitta buyurtma + yetkazishlari (topshiriq №22, 4-band).
   * Do'kon admini — faqat o'z mahsuloti bor buyurtma, qatorlar va yetkazishlar
   * ham faqat o'ziniki (aralash buyurtmada boshqa do'kon qismi ko'rinmaydi).
   */
  async getOrderForBackoffice(id: number, storeId: number | null) {
    const order = await this.OrderRepository.findOne({ where: { id }, include: { all: true } });
    if (!order) throw new NotFoundException('Buyurtma topilmadi');
    const plain: any = order.get({ plain: true });
    if (storeId) {
      plain.orderItems = (plain.orderItems || []).filter((i: any) => Number(i.store_id) === Number(storeId));
      if (!plain.orderItems.length) throw new NotFoundException('Buyurtma topilmadi');
    }
    const deliveries = await Delivery.findAll({
      where: { order_id: id, ...(storeId ? { store_id: storeId } : {}) },
      attributes: { exclude: ['proof_code_hash'] },
      order: [['id', 'ASC']],
    });
    plain.deliveries = deliveries.map((d) => d.get({ plain: true }));
    const jobs = await ServiceJob.findAll({
      where: { order_id: id, ...(storeId ? { store_id: storeId } : {}) },
      order: [['id', 'ASC']],
    });
    plain.jobs = await Promise.all(jobs.map((j) => backofficeJobView(j)));
    plain.stages = await storeStages(this.OrderRepository.sequelize, id);
    if (storeId) plain.stages = plain.stages.filter((x: any) => x.store_id === storeId);
    return this.withQuoteInfo(plain);
  }

  /**
   * Yig'ish bosqichi — `PATCH /orders/:id/stores/:storeId/stage` (№38, 1-band).
   *
   *   kim: shu do'kon admini / `orders.edit` xodimi, superadmin; boshqa do'kon — 403;
   *   o'tish: waiting→packing|ready, packing→ready, ready→packing; qolgani — 409;
   *   409: buyurtma bekor/yakunlangan, KP qabul qilinmagan, kuryer tovarni olib ketgan.
   * Buyurtmaning umumiy holati (`packing`/`ready`) AVTOMATIK qayta hisoblanadi.
   */
  async setStoreStage(orderId: number, storeId: number, stage: string, r: StoreRequester) {
    if (!(STAGES as readonly string[]).includes(stage) || stage === 'waiting') {
      throw new BadRequestException("stage: packing yoki ready");
    }
    if (r?.role !== 'superadmin' && Number(r?.store_id) !== Number(storeId)) {
      throw new ForbiddenException("Boshqa do'kon qismining holatini o'zgartirib bo'lmaydi");
    }
    const seq = this.OrderRepository.sequelize;
    const result = await seq.transaction(async (t) => {
      const order = await this.OrderRepository.findByPk(orderId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!order) throw new NotFoundException('Buyurtma topilmadi');
      const [own]: any[] = await seq.query(
        `SELECT COUNT(*)::int AS n FROM "order-items" WHERE order_id = :o AND store_id = :s AND item_type = 'product'`,
        { replacements: { o: orderId, s: storeId }, type: 'SELECT' as any, transaction: t },
      );
      if (!Number(own?.n)) throw new NotFoundException("Buyurtmada bu do'kon tovari yo'q");
      if (['cancelled', 'done'].includes(order.status)) {
        throw new ConflictException(`${order.status} holatidagi buyurtmani yig'ib bo'lmaydi`);
      }
      if (order.kind === 'quote') {
        throw new ConflictException("KP hali qabul qilinmagan — narxi kelishilmagan tovarni yig'ib bo'lmaydi");
      }
      const [picked]: any[] = await seq.query(
        `SELECT id, status FROM deliveries
          WHERE order_id = :o AND store_id = :s AND status IN ('picked_up', 'on_the_way', 'delivered', 'failed')
          LIMIT 1`,
        { replacements: { o: orderId, s: storeId }, type: 'SELECT' as any, transaction: t },
      );
      if (picked) throw new ConflictException(`Kuryer tovarni olib ketgan (yetkazish #${picked.id}: ${picked.status})`);

      const [row] = await OrderStoreProgress.findOrCreate({
        where: { order_id: orderId, store_id: storeId },
        defaults: { order_id: orderId, store_id: storeId, stage: 'waiting' } as any,
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      const from = row.stage as Stage;
      if (!STAGE_TRANSITIONS[from]?.includes(stage as Stage)) {
        throw new ConflictException(`${from} dan ${stage} ga o'tib bo'lmaydi`);
      }
      const now = new Date();
      await row.update(
        {
          stage,
          // waiting -> ready: yig'ish ham shu payt (kuzatish qadamlarida "yig'ilyapti" bo'sh qolmasin)
          packing_at: row.packing_at ?? now,
          ready_at: stage === 'ready' ? now : null,
          updated_by: r?.user_id ?? null,
        } as any,
        { transaction: t },
      );
      const actorType = r?.role === 'superadmin' ? 'superadmin' : 'store';
      await recordOrderEvent({
        order_id: orderId,
        store_id: storeId,
        event: 'stage_changed',
        from_status: from,
        to_status: stage,
        actor_type: actorType,
        actor_id: r?.user_id ?? null,
        transaction: t,
      });
      await syncOrderStatus(seq, orderId, {
        actor_type: actorType,
        actor_id: r?.user_id ?? null,
        note: `Do'kon ${storeId}: ${stage}`,
        transaction: t,
      });
      return { from, row };
    });
    const order = await this.OrderRepository.findByPk(orderId, { attributes: ['id', 'status'] });
    return {
      order_id: orderId,
      store_id: storeId,
      stage: result.row.stage,
      packing_at: result.row.packing_at,
      ready_at: result.row.ready_at,
      order_status: order?.status,
    };
  }

  /** Mijoz kuzatishi (№38, 2-band) — faqat egasi (sayt admini ham); begona — 404. */
  async tracking(orderId: number, requester?: { id?: number; is_admin?: boolean }) {
    const order = await this.OrderRepository.findByPk(orderId, { attributes: ['id', 'user_id'] });
    if (!order || (!requester?.is_admin && Number(order.user_id) !== Number(requester?.id))) {
      throw new NotFoundException('Buyurtma topilmadi');
    }
    return orderTracking(orderId);
  }

  //Delete order by id — faqat egasi yoki admin
  async deleteOrderById(id: number, actor: RequestActor) {
    await this.ensureCanWrite(id, actor);
    // O'chirilgandan keyin egasi va do'konlari bazada topilmaydi (№36)
    const recipients = await orderRecipients(id);

    const deleting = await this.OrderRepository.destroy({ where: { id: id } });
    await this.OrderItemsRepository.destroy({ where: { order_id: id } });
    if (deleting) {
      emitOrderUpdated(id, { recipients });
      return deleting;
    }
    else throw new NotFoundException('Order not found or something wrong');
  }
}
