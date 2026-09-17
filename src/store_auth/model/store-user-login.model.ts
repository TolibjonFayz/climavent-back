import { Column, DataType, Model, Table } from 'sequelize-typescript';

export const LOGIN_EVENTS = [
  'login_success',
  'login_failed',
  'password_changed',
  // Joriy parol noto'g'ri kiritildi — urinishlar chegarasi shu yozuvlardan sanaladi
  'password_change_failed',
  'password_set',
  'logout',
] as const;
export type LoginEvent = (typeof LOGIN_EVENTS)[number];

/**
 * Do'kon hisoblari kirish jurnali (topshiriq №21, 2-band).
 * Parol HECH QACHON yozilmaydi. Saqlash muddati — 12 oy (fon tozalash).
 */
@Table({ tableName: 'store_user_logins', timestamps: false })
export class StoreUserLogin extends Model {
  @Column({ type: DataType.BIGINT, autoIncrement: true, primaryKey: true })
  id: number;

  @Column({ type: DataType.INTEGER, allowNull: true }) store_user_id: number | null;
  @Column({ type: DataType.STRING(100), allowNull: true }) login: string | null;
  @Column({ type: DataType.STRING(30), allowNull: false }) event: LoginEvent;
  @Column({ type: DataType.STRING(64), allowNull: true }) ip: string | null;
  @Column({ type: DataType.STRING(500), allowNull: true }) user_agent: string | null;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) created_at: Date;
}
