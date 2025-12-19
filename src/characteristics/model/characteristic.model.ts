import { ApiProperty } from '@nestjs/swagger';
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { Product } from 'src/products/model/product.model';

interface CharasteristicAtr {
  title: String;
  price: Number;
  content: String;
  contentJson: String;
  product_id: Number;
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
    allowNull: false,
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
}
