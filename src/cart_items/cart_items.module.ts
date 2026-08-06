import { Module } from '@nestjs/common';
import { CartItemsService } from './cart_items.service';
import { CartItemsController } from './cart_items.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { CartItem } from './model/cart_item.model';
import { Cart } from 'src/cart/models/cart.model';

@Module({
  imports: [
    SequelizeModule.forFeature([CartItem, Cart]),
    JwtModule.register({}),
  ],
  controllers: [CartItemsController],
  providers: [CartItemsService],
  exports: [CartItemsService],
})
export class CartItemsModule {}
