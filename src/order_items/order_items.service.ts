import { pushToStoreAdmins } from 'src/deliveries/push';
import { QueryTypes } from 'sequelize';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderItemDto } from './dto/create-order_item.dto';
import { UpdateOrderItemDto } from './dto/update-order_item.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { OrderItem } from './model/order_item.model';
import { Product } from 'src/products/model/product.model';
import { Order } from 'src/orders/model/order.model';
import { OrderPricingService } from './order-pricing.service';
import { RequestActor } from 'src/guards/customer_or_backoffice.guard';
import { storeProductIds } from 'src/common/helpers/store-scope';
import { recordOrderEvent } from 'src/orders/order-events';

@Injectable()
export class OrderItemsService {
  constructor(
    @InjectModel(OrderItem)
    private readonly OrderItemRepository: typeof OrderItem,
    @InjectModel(Product)
    private readonly productRepository: typeof Product,
    @InjectModel(Order)
    private readonly orderRepository: typeof Order,
    private readonly pricing: OrderPricingService,
  ) {}

  // Qatorning tegishli buyurtmasi egasi (yoki admin ekanini) tekshiradi
  private async ensureOrderOwnerOrAdmin(
    orderId: number,
    requester: { id?: number; is_admin?: boolean },
  ) {
    const order = await this.orderRepository.findByPk(orderId);
    if (!order) {
      throw new NotFoundException('Order not found or something wrong');
    }
    if (order.user_id !== requester?.id && !requester?.is_admin) {
      throw new ForbiddenException('Bu buyurtma sizga tegishli emas');
    }
    return order;
  }

  //Creating a order item — faqat buyurtma egasi yoki admin
  async createOrderItem(
    createOrderItemDto: CreateOrderItemDto,
    requester: { id?: number; is_admin?: boolean },
  ) {
    await this.ensureOrderOwnerOrAdmin(createOrderItemDto.order_id, requester);

    // Narx va model bog'lanishini SERVER aniqlaydi (topshiriq №13, 4-band).
    // Mijoz yuborgan `price` e'tiborga olinmaydi.
    const priced = await this.pricing.resolve({
      product_id: createOrderItemDto.product_id,
      product_model: createOrderItemDto.product_model,
      product_model_id: createOrderItemDto.product_model_id,
      product_model_inside_id: createOrderItemDto.product_model_inside_id,
    });

    const newOrderItem = await this.OrderItemRepository.create({
      order_id: createOrderItemDto.order_id,
      product_id: createOrderItemDto.product_id,
      product_model: createOrderItemDto.product_model,
      quantity: createOrderItemDto.quantity,
      price: priced.price,
      // Aksiyasiz narx — "aksiyada qancha chegirma berildi" hisoboti uchun (№15)
      regular_price: priced.regular_price,
      // Mijoz yubormagan bo'lsa ham nom bo'yicha topilgan model yoziladi —
      // "qaysi model ko'proq sotilgan" reytingi (№11) shunga tayanadi.
      product_model_id: priced.product_model_id ?? undefined,
      product_model_inside_id: priced.product_model_inside_id ?? undefined,
    });

    await this.pricing.recomputeOrderTotal(createOrderItemDto.order_id);
    // Narxsiz qator qo'shilgan bo'lsa buyurtma AVTOMATIK KP so'roviga
    // aylanadi (topshiriq №25, 1-band): mijoz "Buyurtma berish" bosgan
    // bo'lsa ham, narxi yo'q mahsulotni sotib olib bo'lmaydi — avval
    // sotuvchi narx berishi kerak. Qatorlar buyurtma yaratilgandan KEYIN
    // qo'shilgani uchun tekshiruv aynan shu yerda.
    const kind = await this.ensureQuoteKind(createOrderItemDto.order_id, priced.price, requester);
    await this.notifyStoreOfNewOrder(createOrderItemDto.order_id, createOrderItemDto.product_id, newOrderItem.id);

    // "kopbuyurtirilgan" sort uchun mahsulotning sotilgan sonini oshiramiz
    await this.productRepository.increment('sold_count', {
      by: createOrderItemDto.quantity,
      where: { id: createOrderItemDto.product_id },
    });

    const response = { message: 'Order successfully created', newOrderItem, kind };
    return response;
  }

  /**
   * Narxsiz qator buyurtmani KP so'roviga aylantiradi (topshiriq №25, 1-band).
   * Javobda `kind` qaytadi — sayt "so'rov yuborildi" yoki "buyurtma qabul
   * qilindi" deb TO'G'RI yozishi uchun.
   */
  private async ensureQuoteKind(
    orderId: number,
    price: number | null,
    requester: { id?: number; is_admin?: boolean },
  ): Promise<string> {
    const order = await this.orderRepository.findByPk(orderId, { attributes: ['id', 'kind', 'status'] });
    if (!order) return 'order';
    if (order.kind === 'quote' || price !== null) return order.kind;
    await this.orderRepository.update({ kind: 'quote' } as any, { where: { id: orderId }, silent: true });
    await recordOrderEvent({
      order_id: orderId,
      event: 'status_changed',
      from_status: order.status,
      to_status: order.status,
      actor_type: requester?.is_admin ? 'superadmin' : 'customer',
      actor_id: requester?.id ?? null,
      note: "Narxsiz qator qo'shildi — buyurtma KP so'roviga aylandi",
    });
    return 'quote';
  }

  // Get all order items.
  // `storeId` berilsa (do'kon admini tokeni) — faqat o'sha do'kon
  // mahsulotlariga tegishli qatorlar (topshiriq №13, 6-band). Ilgari butun
  // jadval qaytib, izolyatsiyani adminkaning o'zi qilardi.
  async getAllOrderItems(storeId?: number | null) {
    const orderItems = await this.OrderItemRepository.findAll({
      ...(storeId
        ? { where: { product_id: { [Op.in]: storeProductIds(storeId) } } }
        : {}),
      include: { all: true },
    });
    return orderItems;
  }

  /**
   * Bitta qatorni o'qish huquqi.
   *
   * Ilgari `one/:id` va `oneuser/:id` da guard UMUMAN yo'q edi: tokensiz
   * so'rov buyurtmaning yetkazib berish manzilini (`order.location`) va
   * `user_id` sini qaytarardi, id'lar esa ketma-ket — ya'ni hamma
   * mijozlarning manzilini yig'ib olish mumkin edi.
   */
  private async ensureCanRead(item: OrderItem, actor: RequestActor) {
    if (actor?.kind === 'superadmin') return;
    if (actor?.kind === 'store_admin') {
      const product = await this.productRepository.findByPk(item.product_id, {
        attributes: ['store_id'],
      });
      if (product?.store_id && product.store_id === actor.store_id) return;
      throw new ForbiddenException("Bu buyurtma qatori sizning do'koningizga tegishli emas");
    }
    const order = await this.orderRepository.findByPk(item.order_id, {
      attributes: ['user_id'],
    });
    if (order?.user_id === actor?.user_id || actor?.is_admin) return;
    throw new ForbiddenException('Bu buyurtma sizga tegishli emas');
  }

  //Get order item by id
  async getOrderItemById(id: number, actor: RequestActor) {
    const item = await this.OrderItemRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (!item) throw new NotFoundException('Order item not found or id is invalid');
    await this.ensureCanRead(item, actor);
    return item;
  }

  //Get order item by order
  async getOrderItemByOrderId(id: number, actor: RequestActor) {
    const item = await this.OrderItemRepository.findOne({
      where: { order_id: id },
      include: { all: true },
    });
    if (!item) {
      throw new NotFoundException('User order item not found or id is invalid');
    }
    await this.ensureCanRead(item, actor);
    return item;
  }

  //Update order item by id — faqat buyurtma egasi yoki admin
  async updateOrderItemById(
    id: number,
    updateOrderItemDto: UpdateOrderItemDto,
    requester: { id?: number; is_admin?: boolean },
  ) {
    const existing = await this.OrderItemRepository.findByPk(id);
    if (!existing) {
      throw new NotFoundException('Order item not found or something wrong');
    }
    await this.ensureOrderOwnerOrAdmin(existing.order_id, requester);

    // Kim nimani o'zgartira oladi (topshiriq №13, 4-band):
    //   mijoz — faqat SONINI. Narx buyurtma paytida muhrlangan; mijoz uni
    //           o'zgartira olsa pul analitikasiga ishonib bo'lmasdi.
    //   sayt admini — narxni ham ("so'rov bo'yicha" modelning kelishilgan
    //           narxi) va qatorni boshqa buyurtmaga ko'chirmasdan tahrirlash.
    const payload: any = requester?.is_admin
      ? { ...updateOrderItemDto }
      : { quantity: updateOrderItemDto.quantity };
    delete payload.order_id;
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    if (Object.keys(payload).length === 0) {
      return existing.get({ plain: true });
    }

    const updated = await this.OrderItemRepository.update(payload, {
      where: { id: id },
      returning: true,
    });
    if (!updated[1][0]) {
      throw new NotFoundException('Order item not found or something wrong');
    }
    await this.pricing.recomputeOrderTotal(existing.order_id);
    return updated[1][0].get({ plain: true });
  }

  //Delete order item by id — faqat buyurtma egasi yoki admin
  async deleteOrderItemById(
    id: number,
    requester: { id?: number; is_admin?: boolean },
  ) {
    const existing = await this.OrderItemRepository.findByPk(id);
    if (!existing) {
      throw new NotFoundException('Order item not found or something wrong');
    }
    await this.ensureOrderOwnerOrAdmin(existing.order_id, requester);

    const deleting = await this.OrderItemRepository.destroy({
      where: { id: id },
    });
    if (!deleting) {
      throw new NotFoundException('Order item not found or something wrong');
    }
    await this.pricing.recomputeOrderTotal(existing.order_id);
    return deleting;
  }

  /**
   * Do'kon adminlariga "yangi buyurtma / KP so'rovi" push (topshiriq №22, 7-band).
   * Buyurtmada shu do'konning BIRINCHI qatori qo'shilganda bir marta yuboriladi
   * (buyurtma qatorsiz yaratiladi, do'kon esa qatordan ma'lum bo'ladi).
   * Push yuborilmasa asosiy amal buzilmaydi.
   */
  private async notifyStoreOfNewOrder(orderId: number, productId: number, itemId: number) {
    try {
      const [row]: any[] = await this.OrderItemRepository.sequelize.query(
        `SELECT p.store_id, o.kind,
                (SELECT COUNT(*)::int FROM "order-items" i JOIN products p2 ON p2.id = i.product_id
                  WHERE i.order_id = :order AND p2.store_id = p.store_id AND i.id <> :item) AS before
           FROM products p, orders o WHERE p.id = :product AND o.id = :order`,
        { replacements: { order: orderId, product: productId, item: itemId }, type: QueryTypes.SELECT },
      );
      if (!row?.store_id || row.before > 0) return;
      const quote = row.kind === 'quote';
      await pushToStoreAdmins([row.store_id], {
        title: quote ? "Yangi KP so'rovi" : 'Yangi buyurtma',
        body: `#${orderId}`,
        data: { type: quote ? 'new_quote' : 'new_order', order_id: orderId },
      });
    } catch {
      // push ixtiyoriy
    }
  }

}
