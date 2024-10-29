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
import { CartItem } from 'src/cart_items/model/cart_item.model';

interface CartAtr {
  user_id: number;
}

@Table({ tableName: 'cart' })
export class Cart extends Model<Cart, CartAtr> {
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

  @HasMany(() => CartItem)
  cartItems: CartItem;
}
