import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { Product } from 'src/products/model/product.model';
import { ProductModelInfo } from 'src/product_model_infos/models/product_model_info.model';

interface ProductModelHeaderAtr {
  product_id: Number;
  header_name_uz: String;
  header_name_ru: String;
  header_name_en: String;
}

@Table({ tableName: 'product_model_header' })
export class ProductModelHeader extends Model<
  ProductModelHeader,
  ProductModelHeaderAtr
> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ApiProperty({ example: "O'lchami uz", description: 'Size of it' })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  header_name_uz: string;

  @ApiProperty({ example: "O'lchami ru", description: 'Size of it' })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  header_name_ru: string;

  @ApiProperty({ example: "O'lchami en", description: 'Size of it' })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  header_name_en: string;

  @ForeignKey(() => Product)
  @ApiProperty({ example: 1, description: 'Product id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  product_id: number;
  @BelongsTo(() => Product)
  product: Product;

  @HasMany(() => ProductModelInfo)
  modelheaders: ProductModelInfo;
}
