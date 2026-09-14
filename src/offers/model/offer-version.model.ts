import { Column, DataType, Model, Table } from 'sequelize-typescript';

export const OFFER_KINDS = ['seller', 'buyer', 'privacy'] as const;

// Oferta versiyasi (topshiriq №16, 3-band). Har bir tur uchun bazada faqat
// BITTA `is_current` bo'la oladi (qisman unique indeks).
@Table({ tableName: 'offer_versions', createdAt: 'created_at', updatedAt: 'updated_at' })
export class OfferVersion extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @Column({ type: DataType.TEXT, allowNull: false }) kind: string;
  @Column({ type: DataType.TEXT, allowNull: false }) version: string;
  @Column({ type: DataType.TEXT, allowNull: false }) url: string;
  @Column({ type: DataType.DATE, allowNull: false }) published_at: Date;
  @Column({ type: DataType.DATE, allowNull: false }) effective_at: Date;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false }) is_current: boolean;
}
