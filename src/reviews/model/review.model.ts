import { ApiProperty } from '@nestjs/swagger';
import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { Product } from 'src/products/model/product.model';

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
    example: 5,
    description: 'How do you rate this product 1 to 5',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  stars: number;

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
