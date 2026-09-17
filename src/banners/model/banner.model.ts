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

interface BannerAtr {
  title_uz: String;
  title_ru: String;
  title_en: String;
  text_uz: String;
  text_ru: String;
  text_en: String;
  img_url: String;
  product_id: Number;
  orderid: Number;
  is_active?: Boolean;
  link?: String;
  sort_order?: Number;
}

@Table({ tableName: 'banner' })
export class Banner extends Model<Banner, BannerAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Name of the banner in uzb',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  title_uz: string;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Name of the banner in russian',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  title_ru: string;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Name of the banner in english',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  title_en: string;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Info of the banner in uzb',
  })
  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  text_uz: string;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Info of the banner in russian',
  })
  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  text_ru: string;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Info of the banner in english',
  })
  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  text_en: string;

  @ApiProperty({
    example: 'something.jpg',
    description: 'URL of image',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  img_url: string;

  @ApiProperty({ example: 1, description: 'Order id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  orderid: number;

  // Topshiriq №19, 5-band. Mavsumiy bannerni o'chirmasdan yashirish,
  // bosilganda havolaga o'tish va tartibni boshqarish uchun.
  @ApiProperty({ example: true, description: "Banner saytda ko'rinadimi" })
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  is_active: boolean;

  // Ichki yo'l (`/category/konditsionerlar`) yoki to'liq URL. Bo'sh bo'lsa
  // sayt eskicha `product_id` bo'yicha mahsulot sahifasiga o'tadi.
  @ApiProperty({ example: '/category/konditsionerlar', required: false })
  @Column({ type: DataType.STRING(500), allowNull: true })
  link: string;

  @ApiProperty({ example: 1, description: 'Tartib (kichigi oldinda)' })
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  sort_order: number;

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
