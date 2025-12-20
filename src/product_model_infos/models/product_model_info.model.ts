import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';

interface ProductModelInfoAtr {
  info: String;
  product_model_id: Number;
}

@Table({ tableName: 'product_model_info' })
export class ProductModelInfo extends Model<
  ProductModelInfo,
  ProductModelInfoAtr
> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @ApiProperty({
    example: 'BNB243.1-053-050-01-1.8-04-1',
    description: 'Model info of product',
  })
  @Column({ type: DataType.STRING, allowNull: false })
  info: string;
}
