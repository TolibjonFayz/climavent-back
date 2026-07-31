import { Module } from '@nestjs/common';
import { OrderItemsService } from './order_items.service';
import { OrderItemsController } from './order_items.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { OrderItem } from './model/order_item.model';
import { Product } from 'src/products/model/product.model';
import { Order } from 'src/orders/model/order.model';

@Module({
  imports: [
    SequelizeModule.forFeature([OrderItem, Product, Order]),
    JwtModule.register({}),
  ],
  controllers: [OrderItemsController],
  providers: [OrderItemsService],
  exports: [OrderItemsService],
})
export class OrderItemsModule {}
