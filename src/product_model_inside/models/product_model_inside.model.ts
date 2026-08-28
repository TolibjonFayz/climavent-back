import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { Characteristic } from 'src/characteristics/model/characteristic.model';

interface ProductModelInsideAtr {
  sap_name: string;
  in_model_name: string;
  product_model_id: number;
  price: number;
}

@Table({ tableName: 'product-model-inside' })
export class ProductModelInside extends Model<
  ProductModelInside,
  ProductModelInsideAtr
> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @ApiProperty({
    example: 'ВЦ 4-75-2,5-О-1-0,12/1500',
    description: 'SAP model name',
  })
  @Column({ type: DataType.STRING, allowNull: false })
  sap_name: string;

  @ApiProperty({ example: 'VS14-46', description: 'Internal model name' })
  @Column({ type: DataType.STRING, allowNull: false })
  in_model_name: string;

  @ApiProperty({
    example: 120.5,
    description:
      "Narx, DOLLARDA (USD). Diqqat: characteristics.price — SO'MDA. " +
      'NULL = narx kiritilmagan.',
    required: false,
    nullable: true,
  })
  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: true,
    // Sequelize DECIMAL'ni string qaytaradi ("120.50"). Boshqa narx
    // ustunlari (INTEGER) number qaytargani uchun, mijoz tomonda kursga
    // ko'paytirishda chalkashlik bo'lmasin deb bu yerda ham number qilamiz.
    get(this: ProductModelInside): number | null {
      const raw = this.getDataValue('price');
      return raw === null || raw === undefined ? null : Number(raw);
    },
  })
  price: number;

  @ForeignKey(() => Characteristic)
  @ApiProperty({ example: 1, description: 'Characteristic (model) id' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  product_model_id: number;
  @BelongsTo(() => Characteristic)
  characteristic: Characteristic;
}
