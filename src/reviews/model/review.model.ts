import { ApiProperty } from '@nestjs/swagger';
import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'seque54glize-typescript';
import { Product } from 'src/products/model/product.model';
import { User } from 'src/users/model/user.model';

interface ReviewAtr {
  review: String;
  stars: Number;
  user_id: Number;
  product_id: Number;
}

@Table({ tableName: 'reviews' })
export class Review extends Model<Review, ReviewAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ApiProperty({
    example: 'Very quality, I am using with pleasure',
    description: 'Review for the product',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  review: string;

  @ApiProperty({
    example: 4.5,
    description: 'How do you rate this product 1 to 5',
  })
  @Column({
    type: DataType.FLOAT,
    allowNull: false,
  })
  stars: number;

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
