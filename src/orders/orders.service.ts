import {
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
import { quoteDueAt } from './quote-sla';

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
    const kind = createOrderDto.kind || 'order';
    if (status === 'quote_sent' && kind !== 'quote') {
      throw new BadRequestException("quote_sent holati faqat KP so'rovi (kind: quote) uchun");
    }
    const clean = (v?: string | null) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    // Qatorlar buyurtma yozuvining maydoni emas — ular alohida yaratiladi
    const { items: lines, ...orderFields } = createOrderDto as any;
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
    if (Array.isArray(lines) && lines.length) {
      for (const line of lines) {
        await this.orderItems.createOrderItem({ ...line, order_id: newOrder.id }, requester ?? {});
      }
      await newOrder.reload();
    }

    // Saytda chiqarilgan KP — v1 DARHOL yaratiladi, sotuvchi kutilmaydi.
    let quote: any = null;
    if (newOrder.kind === 'quote' && newOrder.source === 'site_kp' && Array.isArray(lines) && lines.length) {
      quote = await this.quotes.issueSiteQuote(newOrder.id, requester ?? {});
      await newOrder.reload();
    }

    const response: any = { message: 'Order successfully created', newOrder };
    if (quote) {
      // Sayt KP sahifasini shundan chizadi
      response.quotes = quote.quotes;
      response.all_priced = quote.all_priced;
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
  async getAllOrders(storeId?: number | null, kind?: string, source?: string) {
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
    if (!storeId) {
      const rows = await this.OrderRepository.findAll({ where: kindWhere, include: { all: true } });
      return rows.map(withDue) as any;
    }

    const orders = await this.OrderRepository.findAll({
      where: {
        ...kindWhere,
        id: {
          [Op.in]: Sequelize.literal(
            `(SELECT DISTINCT order_id FROM "order-items" WHERE product_id IN ` +
              `(SELECT id FROM products WHERE store_id = ${Number(storeId)}))`,
          ),
        },
      },
      include: { all: true },
    });

    // Ichma-ich qatorlarni ham do'kon bo'yicha qisqartiramiz.
    const mahsulotlar = await this.productRepository.findAll({
      where: { store_id: Number(storeId) },
      attributes: ['id'],
    });
    const meniki = new Set(mahsulotlar.map((p) => p.id));
    return orders.map((o) => {
      const plain: any = withDue(o);
      plain.orderItems = (plain.orderItems || []).filter((i: any) =>
        meniki.has(i.product_id),
      );
      return plain;
    });
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
    return this.withQuoteInfo(order.get({ plain: true }), {
      forCustomer: !requester?.is_admin,
    });
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
        include: [{ model: Product, attributes: ['store_id'] }],
      });
      const storeIds = new Set(
        items.map((i) => (i as any).product?.store_id ?? null),
      );
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
    }
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
      const mahsulotlar = await this.productRepository.findAll({ where: { store_id: storeId }, attributes: ['id'] });
      const meniki = new Set(mahsulotlar.map((p) => p.id));
      plain.orderItems = (plain.orderItems || []).filter((i: any) => meniki.has(i.product_id));
      if (!plain.orderItems.length) throw new NotFoundException('Buyurtma topilmadi');
    }
    const deliveries = await Delivery.findAll({
      where: { order_id: id, ...(storeId ? { store_id: storeId } : {}) },
      attributes: { exclude: ['proof_code_hash'] },
      order: [['id', 'ASC']],
    });
    plain.deliveries = deliveries.map((d) => d.get({ plain: true }));
    return this.withQuoteInfo(plain);
  }

  //Delete order by id — faqat egasi yoki admin
  async deleteOrderById(id: number, actor: RequestActor) {
    await this.ensureCanWrite(id, actor);

    const deleting = await this.OrderRepository.destroy({ where: { id: id } });
    await this.OrderItemsRepository.destroy({ where: { order_id: id } });
    if (deleting) return deleting;
    else throw new NotFoundException('Order not found or something wrong');
  }
}
