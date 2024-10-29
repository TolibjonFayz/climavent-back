import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrderItemDto } from './dto/create-order_item.dto';
import { UpdateOrderItemDto } from './dto/update-order_item.dto';
import { InjectModel } from '@nestjs/sequelize';
import { OrderItem } from './model/order_item.model';

@Injectable()
export class OrderItemsService {
  constructor(
    @InjectModel(OrderItem)
    private readonly OrderItemRepository: typeof OrderItem,
  ) {}

  //Creating a order item
  async createOrderItem(createOrderItemDto: CreateOrderItemDto) {
    const newOrderItem =
      await this.OrderItemRepository.create(createOrderItemDto);
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

  //Get order item by userid
  async getOrderItemByUserId(id: number) {
    const userOrder = await this.OrderItemRepository.findOne({
      where: { user_id: id },
      include: { all: true },
    });
    if (userOrder) return userOrder;
    else
      throw new NotFoundException('User order item not found or id is invalid');
  }

  //Update order item by id
  async updateOrderItemById(
    id: number,
    updateOrderItemDto: UpdateOrderItemDto,
  ) {
    const updated = await this.OrderItemRepository.update(updateOrderItemDto, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else
      return new NotFoundException('Order item not found or something wrong');
  }

  //Delete order item by id
  async deleteOrderItemById(id: number) {
    const deleting = await this.OrderItemRepository.destroy({
      where: { id: id },
    });
    if (deleting) return deleting;
    else throw new NotFoundException('Order item not found or something wrong');
  }
}
