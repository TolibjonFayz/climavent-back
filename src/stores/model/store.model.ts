import { ApiProperty } from '@nestjs/swagger';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface StoreAtr {
  name: string;
  slug: string;
  is_active: boolean;
  description_uz: string;
  description_ru: string;
  description_en: string;
  logo_url: string;
  phone: string;
  email: string;
  address: string;
  telegram: string;
  website: string;
  color: string;
  sort_order: number;
}

// Marketplace do'koni. Ilgari do'kon `products.producer` matni orqali
// ajratilardi — bu vaqtinchalik konvensiya edi. `producer` ustuni hali
// joyida (eski kod undan foydalanadi), lekin haqiqiy bog'lanish shu yerda.
@Table({ tableName: 'stores' })
export class Store extends Model<Store, StoreAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @ApiProperty({ example: 'Jihozvent', description: "Do'kon nomi" })
  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  name: string;

  @ApiProperty({ example: 'jihozvent', description: 'URL uchun slug' })
  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  slug: string;

  // false bo'lsa saytda ko'rinmaydi, lekin adminkada qoladi va
  // mahsulotlari o'chib ketmaydi.
  @ApiProperty({ example: true, description: "Do'kon faolmi" })
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  is_active: boolean;

  @ApiProperty({ required: false, description: "Do'kon haqida (uz)" })
  @Column({ type: DataType.TEXT, allowNull: true })
  description_uz: string;

  @ApiProperty({ required: false, description: "Do'kon haqida (ru)" })
  @Column({ type: DataType.TEXT, allowNull: true })
  description_ru: string;

  @ApiProperty({ required: false, description: "Do'kon haqida (en)" })
  @Column({ type: DataType.TEXT, allowNull: true })
  description_en: string;

  // Logotip uchun alohida endpoint kerak emas — POST /api/images/upload-image
  // orqali yuklanib, qaytgan havola shu yerga yoziladi.
  @ApiProperty({ required: false, description: 'Logotip havolasi (Cloudinary)' })
  @Column({ type: DataType.STRING, allowNull: true })
  logo_url: string;

  @ApiProperty({ required: false, example: '+998 90 354 78 88' })
  @Column({ type: DataType.STRING, allowNull: true })
  phone: string;

  @ApiProperty({ required: false, example: 'info@climavent.uz' })
  @Column({ type: DataType.STRING, allowNull: true })
  email: string;

  @ApiProperty({ required: false, example: 'Toshkent, Shota Rustaveli 115' })
  @Column({ type: DataType.STRING, allowNull: true })
  address: string;

  @ApiProperty({ required: false, example: '@climavent' })
  @Column({ type: DataType.STRING, allowNull: true })
  telegram: string;

  @ApiProperty({ required: false, example: 'https://climavent.uz' })
  @Column({ type: DataType.STRING, allowNull: true })
  website: string;

  @ApiProperty({ required: false, example: '#2563eb', description: 'Adminkada ajratish rangi' })
  @Column({ type: DataType.STRING(7), allowNull: true })
  color: string;

  @ApiProperty({ example: 0, description: "Saytda ko'rsatish tartibi" })
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  sort_order: number;

  // Eslatma: `@HasMany(() => Product)` ATAYLAB yo'q. Store `forRoot`
  // modellari ro'yxatida (User unga havola qiladi), Product esa emas —
  // teskari bog'lanish qo'shilsa "Product has not been defined" xatosi
  // chiqadi. Kerakli yo'nalish baribir Product -> Store (BelongsTo).
}
