import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { Cart } from 'src/cart/models/cart.model';
import { Product } from 'src/products/model/product.model';

interface CartItemAtr {
  cart_id: number;
  product_id: number;
  quantity: number;
  price: number;
}

@Table({ tableName: 'cart_item' })
export class CartItem extends Model<CartItem, CartItemAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ForeignKey(() => Cart)
  @ApiProperty({ example: 1, description: 'Cart id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  cart_id: number;
  @BelongsTo(() => Cart)
  cart: Cart;

  @ForeignKey(() => Product)
  @ApiProperty({ example: 1, description: 'Product id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  product_id: number;
  @BelongsTo(() => Product)
  product: Product;

  @ApiProperty({ example: 52, description: 'Quantity of product' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  quantity: number;

  @ApiProperty({ example: 25000, description: 'Price of product' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  price: number;
}
