import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { StoreUser } from 'src/store_users/model/store_user.model';
import { SellerApplicationDocument } from './seller-application-document.model';
import { SellerApplicationEvent } from './seller-application-event.model';

// Sotuvchi arizasi (topshiriq №16, 1-band).
//
// Javobga to'g'ridan-to'g'ri BERILMAYDI: har bir auditoriya uchun alohida
// serializer bor (`seller-applications.serializer.ts`) — sotuvchiga bank
// va ichki izoh, adminkaga `public_token_hash` va `offer_user_agent`
// tushib qolmasligi shu yerda kafolatlanadi.
@Table({ tableName: 'seller_applications', createdAt: 'created_at', updatedAt: 'updated_at' })
export class SellerApplication extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @Column({ type: DataType.TEXT, allowNull: false, defaultValue: 'pending' }) status: string;
  @Column({ type: DataType.TEXT, allowNull: false }) legal_form: string;
  @Column({ type: DataType.TEXT, allowNull: false }) legal_name: string;
  @Column({ type: DataType.TEXT, allowNull: false }) tin: string;
  @Column({ type: DataType.DATEONLY, allowNull: true }) registered_at: string;
  @Column({ type: DataType.TEXT, allowNull: false }) legal_address: string;
  @Column({ type: DataType.TEXT, allowNull: false }) director_name: string;
  @Column({ type: DataType.TEXT, allowNull: true }) director_position: string;
  @Column({ type: DataType.TEXT, allowNull: false }) bank_name: string;
  @Column({ type: DataType.TEXT, allowNull: false }) bank_account: string;
  @Column({ type: DataType.TEXT, allowNull: false }) bank_mfo: string;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false }) vat_payer: boolean;
  @Column({ type: DataType.TEXT, allowNull: true }) vat_code: string;
  @Column({ type: DataType.TEXT, allowNull: false }) contact_name: string;
  @Column({ type: DataType.TEXT, allowNull: false }) contact_phone: string;
  @Column({ type: DataType.TEXT, allowNull: false }) contact_email: string;
  @Column({ type: DataType.TEXT, allowNull: false }) store_name: string;
  @Column({ type: DataType.TEXT, allowNull: false }) business_type: string;
  @Column({ type: DataType.TEXT, allowNull: false }) categories: string;
  @Column({ type: DataType.TEXT, allowNull: true }) brands: string;
  @Column({ type: DataType.TEXT, allowNull: true }) warehouse_address: string;
  @Column({ type: DataType.TEXT, allowNull: true }) delivery_regions: string;
  @Column({ type: DataType.TEXT, allowNull: true }) comment: string;

  @Column({ type: DataType.TEXT, allowNull: false }) offer_version: string;
  @Column({ type: DataType.DATE, allowNull: false }) offer_accepted_at: Date;
  @Column({ type: DataType.TEXT, allowNull: true }) offer_ip: string;
  @Column({ type: DataType.TEXT, allowNull: true }) offer_user_agent: string;

  // Holat sahifasi tokenining SHA-256 xeshi. Token o'zi faqat yaratilganda
  // BIR MARTA qaytadi; baza sizib chiqsa ham undan arizani o'zgartirib
  // bo'lmaydi.
  @Column({ type: DataType.TEXT, allowNull: false }) public_token_hash: string;

  @Column({ type: DataType.TEXT, allowNull: true }) info_request: string;
  @Column({ type: DataType.TEXT, allowNull: true }) reject_reason: string;
  // Ichki izoh — sotuvchiga HECH QACHON ko'rsatilmaydi.
  @Column({ type: DataType.TEXT, allowNull: true }) admin_note: string;

  @ForeignKey(() => StoreUser)
  @Column({ type: DataType.INTEGER, allowNull: true })
  reviewed_by: number;
  @BelongsTo(() => StoreUser, { foreignKey: 'reviewed_by', as: 'reviewer' })
  reviewer: StoreUser;
  // Login MATNI qaror paytida: hisob keyin o'chirilsa ham tarixda "kim" qoladi
  @Column({ type: DataType.TEXT, allowNull: true }) reviewed_by_login: string;

  @Column({ type: DataType.DATE, allowNull: true }) reviewed_at: Date;
  @Column({ type: DataType.INTEGER, allowNull: true }) store_id: number;

  @ForeignKey(() => StoreUser)
  @Column({ type: DataType.INTEGER, allowNull: true })
  store_user_id: number;
  @BelongsTo(() => StoreUser, { foreignKey: 'store_user_id', as: 'sellerAccount' })
  sellerAccount: StoreUser;
  @Column({ type: DataType.TEXT, allowNull: true }) store_user_login: string;

  @HasMany(() => SellerApplicationDocument, 'application_id')
  documents: SellerApplicationDocument[];

  @HasMany(() => SellerApplicationEvent, 'application_id')
  events: SellerApplicationEvent[];

  declare created_at: Date;
  declare updated_at: Date;
}
