import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { Cart } from './models/cart.model';
import { CartItem } from 'src/cart_items/model/cart_item.model';
import { OrderItemsModule } from 'src/order_items/order_items.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Cart, CartItem]),
    JwtModule.register({}),
    OrderItemsModule, // OrderPricingService — savatda joriy narx (№15)
  ],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
