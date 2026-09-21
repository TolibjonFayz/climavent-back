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
  views: Number;
  cart_count: Number;
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

  // Narx (USD). NUMERIC(10,2) — `product-model-inside.price` bilan bir xil,
  // o'nlik son qabul qilinadi. Sequelize DECIMAL'ni SATR qaytaradi
  // ("120.50"), shuning uchun bu yerda number'ga o'giramiz — mijoz
  // tomonda kursga ko'paytirishda chalkashlik bo'lmasin.
  @ApiProperty({ example: 25000.5, description: 'Price of the character' })
  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: false,
    get(this: Characteristic): number | null {
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

  // Foydalanuvchi mahsulot sahifasida shu modelni necha marta TANLAGANI.
  // Sahifa ochilishidagi avto-tanlov sanalmaydi — faqat haqiqiy bosish.
  // Qaysi modellar ko'proq qiziqish uyg'otayotganini o'rganish uchun.
  @ApiProperty({ example: 42, description: 'Model necha marta tanlangani' })
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  views: number;

  // Necha marta savatga solingani. views'dan farqi: bu HARID NIYATI —
  // dashboardda qaysi model haqiqiy talab borligini ko'rsatadi.
  // Savat tozalansa ham qiymat qolaveradi (tarixiy ko'rsatkich).
  @ApiProperty({ example: 7, description: 'Necha marta savatga solingani' })
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  cart_count: number;

  // Bu modelning SAP variantlari. Narx (USD) aynan shu yerda turadi,
  // shuning uchun mahsulot sahifasiga narx shu bog'lanish orqali keladi.
  @HasMany(() => ProductModelInside)
  insides: ProductModelInside[];

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
