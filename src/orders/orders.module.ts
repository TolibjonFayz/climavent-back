import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { Order } from './model/order.model';
import { OrderItem } from 'src/order_items/model/order_item.model';
import { Product } from 'src/products/model/product.model';
import { JwtModule } from '@nestjs/jwt';
import { OrderQuote } from './model/order-quote.model';
import { OrderEvent } from './order-events';
import { QuotesService } from './quotes.service';
import { OtpModule } from 'src/otp/otp.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Order, OrderItem, Product, OrderQuote, OrderEvent]),
    JwtModule.register({}),
    // KP tayyor bo'lganda mijozga SMS (topshiriq №25, 2-band)
    OtpModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, QuotesService],
  exports: [OrdersService, QuotesService],
})
export class OrdersModule {}
