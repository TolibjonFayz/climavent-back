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
  views: number;
  cart_count: number;
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

  // ---- Aksiya (topshiriq №15). Faolligini server hisoblaydi
  // (`common/pricing/sale.ts`); mehmonga faqat FAOL aksiya ko'rinadi
  // (`SalePresentationInterceptor`), adminkaga xom qiymat + `sale_active`.
  @ApiProperty({ example: 103.12, required: false, nullable: true, description: 'Aksiya narxi (USD)' })
  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: true,
    get(this: any): number | null {
      const raw = this.getDataValue('sale_price');
      return raw === null || raw === undefined ? null : Number(raw);
    },
  })
  sale_price: number;

  @ApiProperty({ required: false, nullable: true, description: 'Aksiya boshlanishi' })
  @Column({ type: DataType.DATE, allowNull: true })
  sale_starts_at: Date;

  @ApiProperty({ required: false, nullable: true, description: 'Aksiya tugashi' })
  @Column({ type: DataType.DATE, allowNull: true })
  sale_ends_at: Date;

  // SAP varianti bo'yicha statistika — qaysi aniq variant qiziqish
  // uyg'otyapti va qaysisi savatga tushyapti.
  @ApiProperty({ example: 12, description: 'Necha marta tanlangani' })
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  views: number;

  @ApiProperty({ example: 3, description: 'Necha marta savatga solingani' })
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  cart_count: number;

  @ForeignKey(() => Characteristic)
  @ApiProperty({ example: 1, description: 'Characteristic (model) id' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  product_model_id: number;
  @BelongsTo(() => Characteristic)
  characteristic: Characteristic;

  // ---- Og'irlik va o'lcham (topshiriq №26, 7-band).
  // HVAC uskunasining ko'pi yengil mashinaga sig'maydi: yetkazish
  // yaratilganda jami og'irlik va hajm shulardan hisoblanib, kerakli
  // transport (`required_vehicle`) TAKLIF qilinadi. Bo'sh bo'lsa taxmin
  // qilinmaydi — operator o'zi tanlaydi.
  @ApiProperty({ example: 42.5, required: false, nullable: true, description: "Og'irlik, kg" })
  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: true,
    get(this: any) {
      const raw = this.getDataValue('weight_kg');
      return raw === null || raw === undefined ? null : Number(raw);
    },
  })
  weight_kg: number;

  @ApiProperty({ example: 120, required: false, nullable: true, description: "Uzunlik, sm" })
  @Column({ type: DataType.INTEGER, allowNull: true })
  length_cm: number;

  @ApiProperty({ example: 80, required: false, nullable: true, description: "Eni, sm" })
  @Column({ type: DataType.INTEGER, allowNull: true })
  width_cm: number;

  @ApiProperty({ example: 60, required: false, nullable: true, description: "Balandlik, sm" })
  @Column({ type: DataType.INTEGER, allowNull: true })
  height_cm: number;
}
