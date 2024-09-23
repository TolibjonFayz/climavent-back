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
