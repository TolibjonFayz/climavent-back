import {
  Table,
  Model,
  Column,
  DataType,
  HasMany,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { ProductImages } from 'src/product_images/model/product_image.model';
import { ApiProperty } from '@nestjs/swagger';
import { Review } from 'src/reviews/model/review.model';
import { Category } from 'src/category/model/category.model';
import { ProductModels } from 'src/product_models/models/product_model.model';
import { ProductModelHeader } from 'src/product_model_headers/models/product_model_header.model';

interface ProductAtr {
  category_id: number;
  name_uz: string;
  name_ru: string;
  name_en: string;
  description_short_uz: string;
  description_short_ru: string;
  description_short_en: string;
  price: number;
  views: number;
  quantity: number;
  producer: string;
  fileid: string;
  isRishotka: boolean;
}

@Table({ tableName: 'products' })
export class Product extends Model<Product, ProductAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @ApiProperty({
    example: 'Centrifugal fan type vs14-46',
    description: 'Name of product',
  })
  @Column({ type: DataType.STRING, allowNull: false })
  name_uz: string;

  @ApiProperty({
    example: 'Centrifugal fan type vs14-46',
    description: 'Name of product',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  name_ru: string;

  @ApiProperty({
    example: 'Centrifugal fan type vs14-46',
    description: 'Name of product',
  })
  @Column({ type: DataType.STRING, allowNull: false })
  name_en: string;

  @ApiProperty({
    example: 'Its great, good...',
    description: 'About the product',
  })
  @Column({ type: DataType.TEXT, allowNull: false })
  description_short_uz: string;

  @ApiProperty({
    example: 'Its great, good...',
    description: 'About the product',
  })
  @Column({ type: DataType.TEXT, allowNull: false })
  description_short_ru: string;

  @ApiProperty({
    example: 'Its great, good...',
    description: 'About the product',
  })
  @Column({ type: DataType.TEXT, allowNull: false })
  description_short_en: string;

  @ApiProperty({ example: 20000, description: 'Price of product' })
  @Column({
    type: DataType.INTEGER,
  })
  price: number;

  @ApiProperty({ example: 158, description: 'Views count of product' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  views: number;

  @ApiProperty({ example: 20, description: 'Quantity of product' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  quantity: number;

  @ApiProperty({ example: '76312sd', description: 'Id of the file' })
  @Column({ type: DataType.STRING })
  fileid: string;

  @ApiProperty({
    example: 'Hisense',
    description: 'Producer(maker) of product',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  producer: string;

  @ApiProperty({ example: true, description: 'Is product a rishotka' })
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isRishotka: boolean;

  @ForeignKey(() => Category)
  @ApiProperty({ example: 1, description: 'Category of product' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  category_id: number;
  @BelongsTo(() => Category)
  category: Category;

  @HasMany(() => ProductImages)
  images: ProductImages[];

  @HasMany(() => Review)
  reviews: Review[];

  @HasMany(() => ProductModels)
  models: ProductModels[];

  @HasMany(() => ProductModelHeader)
  modelheaders: ProductModelHeader[];
}
