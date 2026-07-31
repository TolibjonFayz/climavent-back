import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderItemDto } from './dto/create-order_item.dto';
import { UpdateOrderItemDto } from './dto/update-order_item.dto';
import { InjectModel } from '@nestjs/sequelize';
import { OrderItem } from './model/order_item.model';
import { Product } from 'src/products/model/product.model';
import { Order } from 'src/orders/model/order.model';

@Injectable()
export class OrderItemsService {
  constructor(
    @InjectModel(OrderItem)
    private readonly OrderItemRepository: typeof OrderItem,
    @InjectModel(Product)
    private readonly productRepository: typeof Product,
    @InjectModel(Order)
    private readonly orderRepository: typeof Order,
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

    const newOrderItem =
      await this.OrderItemRepository.create(createOrderItemDto);

    // "kopbuyurtirilgan" sort uchun mahsulotning sotilgan sonini oshiramiz
    await this.productRepository.increment('sold_count', {
      by: createOrderItemDto.quantity,
      where: { id: createOrderItemDto.product_id },
    });

    const response = { message: 'Order successfully created', newOrderItem };
    return response;
  }

  //Get all order items
  async getAllOrderItems() {
    const orderItems = await this.OrderItemRepository.findAll({
      include: { all: true },
    });
    return orderItems;
  }

  //Get order item by id
  async getOrderItemById(id: number) {
    const order = await this.OrderItemRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (order) return order;
    else throw new NotFoundException('Order item not found or id is invalid');
  }

  //Get order item by order
  async getOrderItemByOrderId(id: number) {
    const userOrder = await this.OrderItemRepository.findOne({
      where: { order_id: id },
      include: { all: true },
    });
    if (userOrder) return userOrder;
    else
      throw new NotFoundException('User order item not found or id is invalid');
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

    if (Object.keys(updateOrderItemDto).length === 0) {
      return existing.dataValues;
    }

    const updated = await this.OrderItemRepository.update(updateOrderItemDto, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else
      throw new NotFoundException('Order item not found or something wrong');
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
    if (deleting) return deleting;
    else throw new NotFoundException('Order item not found or something wrong');
  }
}
