import { Module } from '@nestjs/common';
import { OrderItemsService } from './order_items.service';
import { OrderItemsController } from './order_items.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { OrderItem } from './model/order_item.model';
import { Product } from 'src/products/model/product.model';
import { Order } from 'src/orders/model/order.model';
import { Characteristic } from 'src/characteristics/model/characteristic.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';
import { Setting } from 'src/settings/model/setting.model';
import { OrderPricingService } from './order-pricing.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      OrderItem,
      Product,
      Order,
      Characteristic,
      ProductModelInside,
      Setting,
    ]),
    JwtModule.register({}),
  ],
  controllers: [OrderItemsController],
  providers: [OrderItemsService, OrderPricingService],
  exports: [OrderItemsService, OrderPricingService],
})
export class OrderItemsModule {}
