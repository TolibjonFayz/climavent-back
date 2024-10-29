import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Order } from './model/order.model';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order) private readonly OrderRepository: typeof Order,
  ) {}

  //Creating a order
  async createOrder(createOrderDto: CreateOrderDto) {
    const newOrder = await this.OrderRepository.create(createOrderDto);
    const response = { message: 'Order successfully created', newOrder };
    return response;
  }

  //Get all orders
  async getAllOrders() {
    const orders = await this.OrderRepository.findAll({
      include: { all: true },
    });
    return orders;
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
    const userOrder = await this.OrderRepository.findOne({
      where: { user_id: id },
      include: { all: true },
    });
    if (userOrder) return userOrder;
    else throw new NotFoundException('User order not found or id is invalid');
  }

  //Update order by id
  async updateOrderById(id: number, updateOrderDto: UpdateOrderDto) {
    const updated = await this.OrderRepository.update(updateOrderDto, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else return new NotFoundException('Order not found or something wrong');
  }

  //Delete order by id
  async deleteOrderById(id: number) {
    const deleting = await this.OrderRepository.destroy({ where: { id: id } });
    if (deleting) return deleting;
    else throw new NotFoundException('Order not found or something wrong');
  }
}
