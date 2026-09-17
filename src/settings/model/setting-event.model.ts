import { ApiProperty } from '@nestjs/swagger';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

/**
 * Sozlama o'zgarishlari tarixi (topshiriq №19, 3-band).
 *
 * Dollar kursi narxlarga to'g'ridan-to'g'ri ta'sir qiladi, shuning uchun
 * "kim, qachon, qaysi qiymatdan qaysi qiymatga va qayerdan (avtomatik yoki
 * qo'lda)" degan savolga javob bo'lishi kerak: nizo chiqqanda buyurtma
 * qaysi kurs bilan hisoblanganini ko'rsatish shu jadval orqali.
 *
 * Faqat QO'SHILADI — o'zgartirish va o'chirish uchun endpoint yo'q.
 */
@Table({ tableName: 'setting_events', timestamps: false })
export class SettingEvent extends Model<SettingEvent> {
  @ApiProperty({ example: 1 })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @ApiProperty({ example: 'usd_rate' })
  @Column({ type: DataType.STRING(100), allowNull: false })
  key: string;

  @ApiProperty({ example: '12000', required: false })
  @Column({ type: DataType.STRING(100), allowNull: true })
  old_value: string;

  @ApiProperty({ example: '12185' })
  @Column({ type: DataType.STRING(100), allowNull: false })
  new_value: string;

  /** 'auto' — kunlik cron (Markaziy bank), 'manual' — adminka yoki bot. */
  @ApiProperty({ example: 'auto', enum: ['auto', 'manual'] })
  @Column({ type: DataType.STRING(20), allowNull: false })
  source: string;

  @ApiProperty({ example: 'superadmin', required: false })
  @Column({ type: DataType.STRING(200), allowNull: true })
  actor: string;

  @ApiProperty({ example: '213.230.78.137', required: false })
  @Column({ type: DataType.STRING(64), allowNull: true })
  ip: string;

  @ApiProperty({ example: 'cbu.uz 16.09.2026', required: false })
  @Column({ type: DataType.STRING(300), allowNull: true })
  note: string;

  @ApiProperty({ example: '2026-09-16T03:00:00.000Z' })
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  created_at: Date;
}
