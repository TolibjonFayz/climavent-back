import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Order } from './model/order.model';
import { OrderItem } from 'src/order_items/model/order_item.model';
import { Product } from 'src/products/model/product.model';
import { User } from 'src/users/model/user.model';
import { ProductImages } from 'src/product_images/model/product_image.model';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order) private readonly OrderRepository: typeof Order,
    @InjectModel(OrderItem)
    private readonly OrderItemsRepository: typeof OrderItem,
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
    await this.OrderItemsRepository.destroy({ where: { order_id: id } });
    if (deleting) return deleting;
    else throw new NotFoundException('Order not found or something wrong');
  }
}
