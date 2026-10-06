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
  title_uz?: String;
  title_ru?: String;
  title_en?: String;
  text_uz?: String;
  text_ru?: String;
  text_en?: String;
  img_url?: String;
  product_id?: Number;
  image_desktop_uz?: String;
  image_desktop_ru?: String;
  image_desktop_en?: String;
  image_mobile_uz?: String;
  image_mobile_ru?: String;
  image_mobile_en?: String;
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
    allowNull: true,
  })
  title_uz: string;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Name of the banner in russian',
  })
  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  title_ru: string;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Name of the banner in english',
  })
  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  title_en: string;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Info of the banner in uzb',
  })
  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  text_uz: string;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Info of the banner in russian',
  })
  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  text_ru: string;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Info of the banner in english',
  })
  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  text_en: string;

  @ApiProperty({
    example: 'something.jpg',
    description: 'URL of image',
  })
  @Column({
    type: DataType.STRING,
    allowNull: true,
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

  // ——— Faqat-rasm banner (2026-10-06) ———
  // Matn rasm ichida, shuning uchun har til uchun alohida rasm. `uz` asosiy:
  // ru/en bo'lmasa uz ko'rsatiladi. Telefon rasmi bo'lmasa desktop rasmi.

  @ApiProperty({ required: false, description: "desktop rasmi (uz), 11:4, masalan 1760×640" })
  @Column({ type: DataType.STRING(500), allowNull: true })
  image_desktop_uz: string;

  @ApiProperty({ required: false, description: "desktop rasmi (ru), 11:4, masalan 1760×640" })
  @Column({ type: DataType.STRING(500), allowNull: true })
  image_desktop_ru: string;

  @ApiProperty({ required: false, description: "desktop rasmi (en), 11:4, masalan 1760×640" })
  @Column({ type: DataType.STRING(500), allowNull: true })
  image_desktop_en: string;

  @ApiProperty({ required: false, description: "mobile rasmi (uz), 4:3, masalan 800×600" })
  @Column({ type: DataType.STRING(500), allowNull: true })
  image_mobile_uz: string;

  @ApiProperty({ required: false, description: "mobile rasmi (ru), 4:3, masalan 800×600" })
  @Column({ type: DataType.STRING(500), allowNull: true })
  image_mobile_ru: string;

  @ApiProperty({ required: false, description: "mobile rasmi (en), 4:3, masalan 800×600" })
  @Column({ type: DataType.STRING(500), allowNull: true })
  image_mobile_en: string;

  @ForeignKey(() => Product)
  @ApiProperty({ example: 1, description: 'Product id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  product_id: number;
  @BelongsTo(() => Product)
  product: Product;
}
