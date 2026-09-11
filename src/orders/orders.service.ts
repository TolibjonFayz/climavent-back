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

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order) private readonly OrderRepository: typeof Order,
    @InjectModel(OrderItem)
    private readonly OrderItemsRepository: typeof OrderItem,
    @InjectModel(Product)
    private readonly productRepository: typeof Product,
  ) {}

  //Creating a order
  async createOrder(createOrderDto: CreateOrderDto) {
    const status = normalizeOrderStatus(createOrderDto.status);
    if (!status) throw new BadRequestException(ORDER_STATUS_MESSAGE);
    const newOrder = await this.OrderRepository.create({
      ...createOrderDto,
      status,
      // Summani mijoz emas, SERVER hisoblaydi — qatorlar qo'shilganda
      // `OrderPricingService.recomputeOrderTotal` yozadi (topshiriq №13,
      // 4-band). Qatorsiz buyurtmaning summasi noma'lum.
      totalAmount: null,
    });
    const response = { message: 'Order successfully created', newOrder };
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
  async getAllOrders(storeId?: number | null) {
    if (!storeId) {
      return this.OrderRepository.findAll({ include: { all: true } });
    }

    const orders = await this.OrderRepository.findAll({
      where: {
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
      const plain: any = o.get({ plain: true });
      plain.orderItems = (plain.orderItems || []).filter((i: any) =>
        meniki.has(i.product_id),
      );
      return plain;
    });
  }

  //Get order by id
  async getOrderById(id: number) {
    const order = await this.OrderRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (order) return order;
    else throw new NotFoundException('Order not found or id is invalid');
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
    return userOrder;
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
    await this.ensureCanWrite(id, actor);

    const payload: any = { ...updateOrderDto };
    // Summa qatorlardan hisoblanadi — to'g'ridan-to'g'ri yozib bo'lmaydi.
    delete payload.totalAmount;
    // Holat qat'iy ro'yxatdan (topshiriq №14, 4-band). Eski o'zbekcha
    // nomlar hozircha qabul qilinadi va yangisiga aylantiriladi —
    // migratsiyagacha yozilgan mijozlar buzilmasin.
    if (payload.status !== undefined) {
      const normalized = normalizeOrderStatus(payload.status);
      if (!normalized) throw new BadRequestException(ORDER_STATUS_MESSAGE);
      payload.status = normalized;
    }

    const updated = await this.OrderRepository.update(payload, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else throw new NotFoundException('Order not found or something wrong');
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
