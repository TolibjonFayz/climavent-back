import { Column, DataType, Model, Table } from 'sequelize-typescript';

/**
 * Mobil ilova sessiyasi (topshiriq №22, 8-band). Tokenning o'zi emas — SHA-256 xeshi.
 * Har ishlatilganda yangisi beriladi; eskisi qayta kelsa — hisobning barcha
 * refresh tokenlari bekor qilinadi (o'g'irlangan token belgisi).
 */
@Table({ tableName: 'store_refresh_tokens', createdAt: 'created_at', updatedAt: false })
export class StoreRefreshToken extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) store_user_id: number;
  @Column({ type: DataType.STRING(64), allowNull: false, unique: true }) token_hash: string;
  /** Berilgan paytdagi `store_users.token_version` — parol almashsa token o'ladi. */
  @Column({ type: DataType.INTEGER, allowNull: false }) token_version: number;
  @Column({ type: DataType.DATE, allowNull: false }) expires_at: Date;
  @Column({ type: DataType.DATE, allowNull: true }) revoked_at: Date | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) replaced_by_id: number | null;
  @Column({ type: DataType.STRING(64), allowNull: true }) ip: string | null;
  @Column({ type: DataType.STRING(500), allowNull: true }) user_agent: string | null;
  declare created_at: Date;
}
