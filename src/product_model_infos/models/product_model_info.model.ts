import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { ProductModels } from 'src/product_models/models/product_model.model';
import { ProductModelHeader } from 'src/product_model_headers/models/product_model_header.model';

interface ProductModelInfoAtr {
  info: String;
  product_model_id: Number;
  product_model_header_id: Number;
}

@Table({ tableName: 'product_model_info' })
export class ProductModelInfo extends Model<
  ProductModelInfo,
  ProductModelInfoAtr
> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ApiProperty({
    example: 'BNB243.1-053-050-01-1.8-04-1',
    description: 'Model info of product',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  info: string;

  @ForeignKey(() => ProductModels)
  @ApiProperty({ example: 1, description: 'Product model id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  product_model_id: number;
  @BelongsTo(() => ProductModels)
  productmodel: ProductModels;

  @ForeignKey(() => ProductModelHeader)
  @ApiProperty({ example: 1, description: 'Product model header id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  product_model_header_id: number;
  @BelongsTo(() => ProductModelHeader)
  productmodelheader: ProductModelHeader;
}
