import { SelectedToCheckoutController } from './selected_to_checkout.controller';
import { SelectedToCheckoutModels } from './model/selected_to_checkout.model';
import { SelectedToCheckoutService } from './selected_to_checkout.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { Module } from '@nestjs/common';
import { CartItem } from 'src/cart_items/model/cart_item.model';
import { Cart } from 'src/cart/models/cart.model';
import { OrderItemsModule } from 'src/order_items/order_items.module';

@Module({
  imports: [
    SequelizeModule.forFeature([SelectedToCheckoutModels, CartItem, Cart]),
    JwtModule.register({}),
    OrderItemsModule, // OrderPricingService — rasmiylashtirishda joriy narx (№15)
  ],
  controllers: [SelectedToCheckoutController],
  providers: [SelectedToCheckoutService],
  exports: [SelectedToCheckoutService],
})
export class SelectedToCheckoutModule {}
