import { SelectedToCheckoutController } from './selected_to_checkout.controller';
import { SelectedToCheckoutModels } from './model/selected_to_checkout.model';
import { SelectedToCheckoutService } from './selected_to_checkout.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { Module } from '@nestjs/common';
import { CartItem } from 'src/cart_items/model/cart_item.model';
import { Cart } from 'src/cart/models/cart.model';

@Module({
  imports: [SequelizeModule.forFeature([SelectedToCheckoutModels, CartItem, Cart
  ])],
  controllers: [SelectedToCheckoutController],
  providers: [SelectedToCheckoutService],
  exports: [SelectedToCheckoutService],
})
export class SelectedToCheckoutModule {}
