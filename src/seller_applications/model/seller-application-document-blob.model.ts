import { Column, DataType, Model, Table } from 'sequelize-typescript';

// Hujjat baytlari. Hech qachon javobga ro'yxat bilan tushmaydi — faqat
// imzolangan havola orqali, bitta fayl bo'lib beriladi.
@Table({ tableName: 'seller_application_document_blobs', timestamps: false })
export class SellerApplicationDocumentBlob extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true }) document_id: number;
  @Column({ type: DataType.BLOB, allowNull: false }) data: Buffer;
}
