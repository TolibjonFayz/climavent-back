import { Column, DataType, Model, Table } from 'sequelize-typescript';

// Hujjat METAMA'LUMOTI. Baytlar alohida jadvalda (`...DocumentBlob`) —
// ro'yxat o'qilganda megabaytlar xotiraga tortilmasin.
@Table({ tableName: 'seller_application_documents', createdAt: 'created_at', updatedAt: false })
export class SellerApplicationDocument extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  // Yuklash paytida NULL, ariza topshirilganda bog'lanadi
  @Column({ type: DataType.INTEGER, allowNull: true }) application_id: number;
  @Column({ type: DataType.TEXT, allowNull: false }) type: string;
  // Tasodifiy kalit. Asl nom faqat `original_name` da.
  // `db` da — shunchaki tasodifiy satr; `r2` da — obyekt kaliti
  // (`seller-docs/<uuid>`).
  @Column({ type: DataType.TEXT, allowNull: false }) file_key: string;
  // Fayl qayerda: 'db' (baza) yoki 'r2' (yopiq bucket) — topshiriq №20, 1-band
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'db' }) storage: string;
  @Column({ type: DataType.TEXT, allowNull: false }) original_name: string;
  @Column({ type: DataType.TEXT, allowNull: false }) mime: string;
  @Column({ type: DataType.INTEGER, allowNull: false }) size: number;
  // Pasport 30 kundan keyin o'chirilganda qo'yiladi; yozuvning o'zi qoladi.
  @Column({ type: DataType.DATE, allowNull: true }) deleted_at: Date;

  declare created_at: Date;
}
