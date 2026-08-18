import { ApiProperty } from '@nestjs/swagger';
import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { ProductModelInfo } from 'src/product_model_infos/models/product_model_info.model';
import { Product } from 'src/products/model/product.model';

interface ProductModelsAtr {
  name: String;
  price: Number;
  currency: String;
  price_updated_at: Date;
  price_valid_until: Date;
  sap_name: String;
  quantity: Number;
  airflow_m3h: Number;
  pressure_pa: Number;
  product_id: Number;
}

@Table({ tableName: 'product_models' })
export class ProductModels extends Model<ProductModels, ProductModelsAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @ApiProperty({
    example: 'BNB243.1-053-050-01-1.8-04-1',
    description: 'Model of product',
  })
  @Column({ type: DataType.STRING, allowNull: false })
  name: string;

  /**
   * @deprecated ISHLATILMAYDI. Haqiqiy narx product_model_inside.price da
   * (DOLLARDA). Bu maydon eski (so'm) va faqat 25 ta yozuvda bor — yangi
   * narx bu yerga YOZILMASIN.
   */
  @ApiProperty({
    example: 1200000,
    description:
      "@deprecated ISHLATILMAYDI — narx product_model_inside.price da (USD). " +
      "Bu maydon eskirgan (so'm).",
    required: false,
    deprecated: true,
  })
  @Column({ type: DataType.INTEGER, allowNull: true })
  price: number;

  /**
   * @deprecated price maydoni bilan birga eskirgan. Hamma yozuvda "UZS" —
   * haqiqiy tanlov emas, standart qiymat.
   */
  @ApiProperty({
    example: 'UZS',
    description: '@deprecated ISHLATILMAYDI — price bilan birga eskirgan.',
    required: false,
    deprecated: true,
  })
  @Column({ type: DataType.STRING, allowNull: true, defaultValue: 'UZS' })
  currency: string;

  @ApiProperty({ description: "Narx oxirgi marta qachon yangilangan", required: false })
  @Column({ type: DataType.DATE, allowNull: true })
  price_updated_at: Date;

  @ApiProperty({ description: "Narx qachongacha amal qiladi", required: false })
  @Column({ type: DataType.DATE, allowNull: true })
  price_valid_until: Date;

  @ApiProperty({
    example: 'ВЦ 4-75-2,5-О-1-0,12/1500',
    description: "Rasmiy SAP kodi (bo'lmasligi mumkin)",
    required: false,
  })
  @Column({ type: DataType.STRING, allowNull: true })
  sap_name: string;

  @ApiProperty({
    example: 12,
    description: "Ombordagi qoldiq (kiritilmagan bo'lsa NULL)",
    required: false,
  })
  @Column({ type: DataType.INTEGER, allowNull: true })
  quantity: number;

  @ApiProperty({
    example: 8000,
    description: "Havo sarfi, m3/soat (kiritilmagan bo'lsa NULL)",
    required: false,
  })
  @Column({ type: DataType.INTEGER, allowNull: true })
  airflow_m3h: number;

  @ApiProperty({
    example: 500,
    description: "To'liq bosim, Pa (kiritilmagan bo'lsa NULL)",
    required: false,
  })
  @Column({ type: DataType.INTEGER, allowNull: true })
  pressure_pa: number;

  @ForeignKey(() => Product)
  @ApiProperty({ example: 1, description: 'Product id' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  product_id: number;
  @BelongsTo(() => Product)
  product: Product;

  @HasMany(() => ProductModelInfo)
  modelinfo: ProductModelInfo;
}
