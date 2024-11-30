import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { Product } from 'src/products/model/product.model';
import { Order } from 'src/orders/model/order.model';

interface OrderItemAtr {
  order_id: number;
  product_id: number;
  product_model: string;
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

  @ForeignKey(() => Order)
  @ApiProperty({ example: 1, description: 'Order id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  order_id: number;
  @BelongsTo(() => Order)
  order: Order;

  @ForeignKey(() => Product)
  @ApiProperty({ example: 1, description: 'Product id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  product_id: number;
  @BelongsTo(() => Product)
  product: Product;

  @ApiProperty({ example: 'HVAUSDHVOH', description: 'Model of product' })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  product_model: string;

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
