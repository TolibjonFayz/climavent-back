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

interface ProductImagesAtr {
  image_link: String;
  product_id: Number;
}

@Table({ tableName: 'product_images' })
export class ProductImages extends Model<ProductImages, ProductImagesAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ApiProperty({ example: 'kdjasjbfs.png', description: 'Image of product' })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  image_link: string;

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
