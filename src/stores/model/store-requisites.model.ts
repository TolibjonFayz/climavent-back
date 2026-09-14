import { Column, DataType, Model, Table } from 'sequelize-typescript';

// Do'konning YOPIQ rekvizitlari (topshiriq №16, 8-band).
//
// ATAYLAB `stores` jadvalida EMAS va ATAYLAB hech bir modelga
// `@HasOne`/`@BelongsTo` bilan bog'lanmagan: kod bazasida
// `include: { all: true }` o'nlab joyda bor va `Product` do'konni to'liq
// yuklaydi. Bog'lanish bo'lsa bank hisob raqami `products/all` kabi ochiq
// javoblarga sizib chiqardi. Bu jadval faqat `StoresService` orqali,
// huquq tekshirilgandan keyin o'qiladi.
@Table({ tableName: 'store_requisites', createdAt: 'created_at', updatedAt: 'updated_at' })
export class StoreRequisites extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true }) store_id: number;
  @Column({ type: DataType.TEXT, allowNull: true }) legal_form: string;
  @Column({ type: DataType.TEXT, allowNull: true }) legal_address: string;
  @Column({ type: DataType.TEXT, allowNull: true }) director_name: string;
  @Column({ type: DataType.TEXT, allowNull: true }) bank_name: string;
  @Column({ type: DataType.TEXT, allowNull: true }) bank_account: string;
  @Column({ type: DataType.TEXT, allowNull: true }) bank_mfo: string;
  @Column({ type: DataType.BOOLEAN, allowNull: true }) vat_payer: boolean;
  @Column({ type: DataType.TEXT, allowNull: true }) vat_code: string;
  @Column({ type: DataType.TEXT, allowNull: true }) business_type: string;
  @Column({ type: DataType.INTEGER, allowNull: true }) application_id: number;
}

/** Faqat do'kon egasi va superadmin ko'radigan maydonlar. */
export const PRIVATE_REQUISITE_FIELDS = [
  'legal_form',
  'legal_address',
  'director_name',
  'bank_name',
  'bank_account',
  'bank_mfo',
  'vat_payer',
  'vat_code',
  'business_type',
  'application_id',
] as const;

/** Do'kon admini o'zi o'zgartira oladigan (bank) maydonlar. */
export const STORE_ADMIN_EDITABLE_REQUISITES = [
  'bank_name',
  'bank_account',
  'bank_mfo',
  'vat_payer',
  'vat_code',
] as const;
