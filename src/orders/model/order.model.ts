import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { User } from 'src/users/model/user.model';
import { OrderItem } from 'src/order_items/model/order_item.model';

interface OrderAtr {
  user_id: number;
  totalAmount: number;
  status: string;
}

@Table({ tableName: 'orders' })
export class Order extends Model<Order, OrderAtr> {
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

  @ApiProperty({ example: 1, description: 'Total amount of items' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  totalAmount: number;

  @ApiProperty({ example: 1, description: 'Status of order' })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  status: string;

  @HasMany(() => OrderItem)
  orderItems: OrderItem;
}
