import { ApiProperty } from '@nestjs/swagger';
import { Table, Model, Column, DataType, HasMany } from 'sequelize-typescript';
import { ProductImages } from 'src/product_images/model/product_image.model';

interface ProductAtr {
  name: String;
  description_short: String;
  price: Number;
  model: String;
  views: Number;
  quantity: Number;
  producer: String;
}

@Table({ tableName: 'products' })
export class Product extends Model<Product, ProductAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ApiProperty({
    example: 'Centrifugal fan type vs14-46',
    description: 'Name of product',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  name: string;

  @ApiProperty({
    example: 'Its great, good...',
    description: 'About the product',
  })
  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  description_short: string;

  @ApiProperty({ example: 20000, description: 'Price of product' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  price: number;

  @ApiProperty({ example: 'Y36', description: 'Model of product' })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  model: string;

  @ApiProperty({ example: 158, description: 'Views count of product' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  views: number;

  @ApiProperty({ example: 20, description: 'Quantity of product' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  quantity: number;

  @ApiProperty({
    example: 'Hisense',
    description: 'Producer(maker) of product',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  producer: string;

  @HasMany(() => ProductImages)
  images: ProductImages;
}
