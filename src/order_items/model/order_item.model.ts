import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { User } from 'src/users/model/user.model';
import { Product } from 'src/products/model/product.model';

interface OrderItemAtr {
  user_id: number;
  product_id: number;
  quantity: number;
  price: number;
}

@Table({ tableName: 'order-items' })
export class OrderItem extends Model<OrderItem, OrderItemAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ForeignKey(() => User)
  @ApiProperty({ example: 1, description: 'User id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  user_id: number;
  @BelongsTo(() => User)
  user: User;

  @ForeignKey(() => Product)
  @ApiProperty({ example: 1, description: 'Product id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  product_id: number;
  @BelongsTo(() => Product)
  product: Product;

  @ApiProperty({ example: 1, description: 'Quantity of product' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  quantity: number;

  @ApiProperty({ example: 1200000, description: 'Price of product' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  price: number;
}
