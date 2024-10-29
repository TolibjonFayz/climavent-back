import { Module } from '@nestjs/common';
import { CartItemsService } from './cart_items.service';
import { CartItemsController } from './cart_items.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { CartItem } from './model/cart_item.model';

@Module({
  imports: [SequelizeModule.forFeature([CartItem])],
  controllers: [CartItemsController],
  providers: [CartItemsService],
  exports: [CartItemsService],
})
export class CartItemsModule {}
