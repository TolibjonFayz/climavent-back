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
import { User } from 'src/users/model/user.model';
import { OrderItem } from 'src/order_items/model/order_item.model';

interface OrderAtr {
  user_id: number;
  totalAmount: number | null;
  status: string;
  location: string;
  kind?: string;
  source?: string | null;
  comment?: string | null;
  company_name?: string | null;
  company_tin?: string | null;
  region_code?: string | null;
  district_code?: string | null;
}

@Table({ tableName: 'orders' })
export class Order extends Model<Order, OrderAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ForeignKey(() => User)
  @ApiProperty({ example: 1, description: 'User id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  user_id: number;
  @BelongsTo(() => User)
  user: User;

  // Qatorlar yig'indisi (narx x soni) — SERVER hisoblaydi, har safar
  // qator qo'shilganda/o'zgarganda/o'chirilganda qayta hisoblanadi
  // (topshiriq №13, 4-band). Mijoz yuborgan qiymat e'tiborga olinmaydi.
  //
  // NULL — kamida bitta qatorning narxi noma'lum: qisman yig'indini
  // "summa" deb ko'rsatish yolg'on bo'lardi.
  //
  // BIGINT: INTEGER chegarasi ~2.15 mlrd so'm, sanoat uskunasi buyurtmasi
  // undan oshishi mumkin. Getter JSON'da son qaytaradi.
  @ApiProperty({
    example: 148692000,
    nullable: true,
    description: "Buyurtma summasi (so'm). null — narxi yozilmagan qator bor",
  })
  @Column({
    type: DataType.BIGINT,
    allowNull: true,
    get(this: Order) {
      const v = this.getDataValue('totalAmount');
      return v === null || v === undefined ? null : Number(v);
    },
  })
  totalAmount: number | null;

  @ApiProperty({ example: 1, description: 'Status of order' })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  status: string;

  @ApiProperty({ example: 'Location', description: 'Location of order' })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  location: string;

  // KP so'rovi (topshiriq №21, 3-band)
  @ApiProperty({ example: 'order', enum: ['order', 'quote'] })
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'order' })
  kind: string;

  @ApiProperty({ required: false, example: 'Montaj bilan' })
  @Column({ type: DataType.TEXT, allowNull: true })
  comment: string;

  @ApiProperty({ required: false, example: '"AIRCOOL" MChJ' })
  @Column({ type: DataType.STRING(255), allowNull: true })
  company_name: string;

  @ApiProperty({ required: false, example: '301234567' })
  @Column({ type: DataType.STRING(9), allowNull: true })
  company_tin: string;

  // Yetkazish uchun (topshiriq №22, 2-band)
  @ApiProperty({ required: false, example: 'Aziz Karimov' })
  @Column({ type: DataType.STRING(150), allowNull: true })
  recipient_name: string;

  @ApiProperty({ required: false, example: '+998901234567' })
  @Column({ type: DataType.STRING(13), allowNull: true })
  recipient_phone: string;

  @ApiProperty({ required: false, example: "2-kirish, 5-qavat" })
  @Column({ type: DataType.STRING(500), allowNull: true })
  address_details: string;

  @ApiProperty({ required: false, example: 41.311081 })
  @Column({
    type: DataType.DECIMAL(9, 6),
    allowNull: true,
    get(this: Order) {
      const v = this.getDataValue('lat');
      return v === null || v === undefined ? null : Number(v);
    },
  })
  lat: number;

  @ApiProperty({ required: false, example: 69.240562 })
  @Column({
    type: DataType.DECIMAL(9, 6),
    allowNull: true,
    get(this: Order) {
      const v = this.getDataValue('lng');
      return v === null || v === undefined ? null : Number(v);
    },
  })
  lng: number;

  /**
   * KP qayerdan kelgani (topshiriq №28): `site_kp` — mijoz savatdan o'zi
   * chiqargan, `manual` — adminka/bot, `null` — eski yozuvlar.
   */
  @ApiProperty({ required: false, nullable: true, example: 'site_kp', enum: ['site_kp', 'manual'] })
  @Column({ type: DataType.STRING(20), allowNull: true })
  source: string;

  // ——— KP oqimi (topshiriq №25, 3-band) ———
  // DIQQAT: bu ustunlar modelda e'lon qilinmasa, Sequelize `update()` da
  // ularni JIMGINA tashlab yuboradi (migratsiyada bo'lsa ham).
  @ApiProperty({ required: false, nullable: true, description: 'Mijoz KP ni qabul qilgan vaqt' })
  @Column({ type: DataType.DATE, allowNull: true })
  quote_accepted_at: Date;

  @ApiProperty({ required: false, nullable: true, example: 2, description: 'Qabul qilingan KP versiyasi' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  quote_accepted_version: number;

  @ApiProperty({ required: false, nullable: true, example: 'Qimmat', description: 'KP rad etilgan sabab' })
  @Column({ type: DataType.STRING(500), allowNull: true })
  quote_reject_reason: string;

  /**
   * Topshiriq №33, 4-band: xaridor KP ning tayyor qismini qabul qilganda
   * narxi hali kelmagan do'kon bo'limlari DAVOMI buyurtmaga ko'chadi.
   * Davomi buyurtmada — asl buyurtma id si.
   */
  @ApiProperty({ required: false, nullable: true, example: 62 })
  @Column({ type: DataType.INTEGER, allowNull: true })
  parent_order_id: number;

  /**
   * Manzil hududi (topshiriq №39, 4-band) — `GET /api/regions` kodlari.
   * Xizmat faqat shu hududga xizmat ko'rsatadigan hamkordan olinadi.
   */
  @ApiProperty({ required: false, nullable: true, example: 'tashkent_city' })
  @Column({ type: DataType.STRING(40), allowNull: true })
  region_code: string;

  @ApiProperty({ required: false, nullable: true, example: 'yunusobod' })
  @Column({ type: DataType.STRING(40), allowNull: true })
  district_code: string;

  @HasMany(() => OrderItem)
  orderItems: OrderItem;
}
