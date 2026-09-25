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
import { OrderStoreProgress } from './order-progress';
import { QuotesService } from './quotes.service';
import { QuoteSectionJobs } from './quote-section.jobs';
import { OtpModule } from 'src/otp/otp.module';
import { OrderItemsModule } from 'src/order_items/order_items.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Order, OrderItem, Product, OrderQuote, OrderEvent, OrderStoreProgress]),
    JwtModule.register({}),
    // KP tayyor bo'lganda mijozga SMS (topshiriq №25, 2-band)
    OtpModule,
    // Buyurtma bilan birga qator yaratish (topshiriq №28, 1-band).
    // Aylanma bog'liqlik yo'q: OrderItemsModule OrdersModule ni import qilmaydi.
    OrderItemsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, QuotesService, QuoteSectionJobs],
  exports: [OrdersService, QuotesService],
})
export class OrdersModule {}
