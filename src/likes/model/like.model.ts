import { ApiProperty } from '@nestjs/swagger';
import {
  Table,
  Column,
  DataType,
  ForeignKey,
  Model,
  BelongsTo,
} from 'sequelize-typescript';
import { Product } from 'src/products/model/product.model';
import { User } from 'src/users/model/user.model';

interface LikesAtr {
  user_id: Number;
  product_id: Number;
}

@Table({ tableName: 'likes' })
export class Like extends Model<Like, LikesAtr> {
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
}
