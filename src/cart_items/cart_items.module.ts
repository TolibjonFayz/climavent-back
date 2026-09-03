import { Module } from '@nestjs/common';
import { CartItemsService } from './cart_items.service';
import { CartItemsController } from './cart_items.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { CartItem } from './model/cart_item.model';
import { Cart } from 'src/cart/models/cart.model';
import { Characteristic } from 'src/characteristics/model/characteristic.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      CartItem,
      Cart,
      Characteristic,
      ProductModelInside,
    ]),
    JwtModule.register({}),
  ],
  controllers: [CartItemsController],
  providers: [CartItemsService],
  exports: [CartItemsService],
})
export class CartItemsModule {}
