import { Column, DataType, Model, Table } from 'sequelize-typescript';

// Oferta qabul qilinganining DALILI (topshiriq №16, 3-band; oferta 3.6).
// Bazadagi trigger yozuvni o'chirishni ham, mazmunini o'zgartirishni ham
// taqiqlaydi — faqat INSERT.
@Table({ tableName: 'offer_acceptances', timestamps: false })
export class OfferAcceptance extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @Column({ type: DataType.TEXT, allowNull: false }) kind: string;
  @Column({ type: DataType.TEXT, allowNull: false }) version: string;
  @Column({ type: DataType.INTEGER, allowNull: true }) application_id: number;
  @Column({ type: DataType.INTEGER, allowNull: true }) store_id: number;
  @Column({ type: DataType.INTEGER, allowNull: true }) store_user_id: number;
  @Column({ type: DataType.INTEGER, allowNull: true }) user_id: number;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) accepted_at: Date;
  @Column({ type: DataType.TEXT, allowNull: true }) ip: string;
  @Column({ type: DataType.TEXT, allowNull: true }) user_agent: string;
}
