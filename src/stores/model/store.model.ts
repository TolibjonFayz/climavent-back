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

  // Yangi mahsulotning standart narx valyutasi (topshiriq №37). O'zgartirish:
  // do'kon admini (o'z do'koni) va superadmin.
  @ApiProperty({ example: 'USD', enum: ['USD', 'UZS'], description: 'Narxlar odatda qaysi valyutada' })
  @Column({ type: DataType.STRING(3), allowNull: false, defaultValue: 'USD' })
  default_currency: string;

  // OCHIQ rekvizitlar (topshiriq №16, 8-band): saytda sotuvchining yuridik
  // nomi va STIR ko'rinishi elektron tijorat talabi bo'lishi mumkin.
  // Bank, rahbar, QQS esa `store_requisites` da — pastdagi eslatmaga qarang.
  // O'zgartirish: faqat superadmin.
  @ApiProperty({ required: false, nullable: true, example: '"AIRCOOL TASHKENT" MChJ' })
  @Column({ type: DataType.TEXT, allowNull: true })
  legal_name: string;

  @ApiProperty({ required: false, nullable: true, example: '305123456', description: 'STIR' })
  @Column({ type: DataType.TEXT, allowNull: true })
  tin: string;

  // Yagona Climavent KP hujjatidagi shartlar (topshiriq №33, 5-band).
  // Hujjat do'kon №1 yozuvidan olinadi; boshqa do'konlarda ham saqlanadi
  // (ichki hisob-kitob uchun), lekin xaridorga chiqmaydi.
  @ApiProperty({ required: false, nullable: true, example: "Toshkent bo'ylab bepul, 3–5 ish kuni" })
  @Column({ type: DataType.TEXT, allowNull: true })
  default_delivery_terms: string;

  @ApiProperty({ required: false, nullable: true, example: "100% oldindan, bank o'tkazmasi" })
  @Column({ type: DataType.TEXT, allowNull: true })
  default_payment_terms: string;

  // ——— Hamkor turi (topshiriq №39, 1-band). O'zgartirish: faqat superadmin ———
  // Do'kon: sells_products=true (xizmat ham sotsa sells_services=true).
  // Xizmat ko'rsatuvchi: sells_products=false, sells_services=true.
  @ApiProperty({ example: true, description: "Tovar sotadi (false — mahsulot yarata olmaydi, katalogda do'kon emas)" })
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  sells_products: boolean;

  @ApiProperty({ example: false, description: 'Xizmat sotadi (o\'rnatish, tozalash, ta\'mir)' })
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  sells_services: boolean;

  // Xizmat reytingi va bajarilgan ishlar — SERVER hisoblaydi (№39, 10-band)
  @ApiProperty({ example: 4.8, nullable: true, description: 'Xizmat bahosi (1–5), yashirilmagan sharhlardan' })
  @Column({
    type: DataType.DECIMAL(3, 2),
    allowNull: true,
    get(this: Store) {
      const v = this.getDataValue('service_rating');
      return v === null || v === undefined ? null : Number(v);
    },
  })
  service_rating: number | null;

  @ApiProperty({ example: 12 })
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  service_reviews_count: number;

  @ApiProperty({ example: 40, description: 'Bajarilgan xizmat ishlari soni' })
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  jobs_done: number;

  // Eslatma: `@HasMany(() => Product)` ATAYLAB yo'q. Store `forRoot`
  // modellari ro'yxatida (User unga havola qiladi), Product esa emas —
  // teskari bog'lanish qo'shilsa "Product has not been defined" xatosi
  // chiqadi. Kerakli yo'nalish baribir Product -> Store (BelongsTo).
}
