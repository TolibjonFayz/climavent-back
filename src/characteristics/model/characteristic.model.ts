import { ApiProperty } from '@nestjs/swagger';
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { Product } from 'src/products/model/product.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';

interface CharasteristicAtr {
  title: String;
  price: Number;
  content: String;
  contentJson: String;
  product_id: Number;
  airflow_m3h: Number;
  pressure_pa: Number;
}

@Table({ tableName: 'characteristics' })
export class Characteristic extends Model<Characteristic, CharasteristicAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ApiProperty({
    example: 'BO 45',
    description: 'Title of the characteristic',
  })
  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  title: string;

  @ApiProperty({ example: '25000', description: 'Price of the character' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  price: number;

  @ApiProperty({
    example: 'BO 45 information',
    description: 'Information of the characteristic',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  content: string;

  @ApiProperty({
    example: 'BO 45 information as JSON',
    description: 'Information of the characteristic as JSON',
  })
  @Column({
    type: DataType.JSONB,
    allowNull: false,
  })
  contentJson: string;

  @ForeignKey(() => Product)
  @ApiProperty({ example: 1, description: 'Product id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  product_id: number;
  @BelongsTo(() => Product)
  product: Product;

  // Havo sarfi va bosim — avval product_models'da edi, endi shu yerda
  // (product_models o'chirildi). Agent/KP ventilyator tanlashda ishlatadi.
  @ApiProperty({ example: 8000, description: 'Havo sarfi, m3/soat', required: false })
  @Column({ type: DataType.INTEGER, allowNull: true })
  airflow_m3h: number;

  @ApiProperty({ example: 500, description: "To'liq bosim, Pa", required: false })
  @Column({ type: DataType.INTEGER, allowNull: true })
  pressure_pa: number;

  // Bu modelning SAP variantlari. Narx (USD) aynan shu yerda turadi,
  // shuning uchun mahsulot sahifasiga narx shu bog'lanish orqali keladi.
  @HasMany(() => ProductModelInside)
  insides: ProductModelInside[];
}
