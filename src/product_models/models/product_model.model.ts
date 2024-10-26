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

interface ProductModelsAtr {
  name: String;
  price: Number;
  product_id: Number;
}

@Table({ tableName: 'product_models' })
export class ProductModels extends Model<ProductModels, ProductModelsAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @ApiProperty({
    example: 'BNB243.1-053-050-01-1.8-04-1',
    description: 'Model of product',
  })
  @Column({ type: DataType.STRING, allowNull: false })
  name: string;

  @ApiProperty({ example: 1200000, description: 'Price of product' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  price: number;

  @ForeignKey(() => Product)
  @ApiProperty({ example: 1, description: 'Product id' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  product_id: number;
  @BelongsTo(() => Product)
  product: Product;
}
