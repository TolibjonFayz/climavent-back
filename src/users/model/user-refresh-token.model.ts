import { Column, DataType, Model, Table } from 'sequelize-typescript';

/**
 * XARIDOR mobil sessiyasi (topshiriq №29, 3-band).
 *
 * `store_refresh_tokens` ning xaridor tomoni. Tokenning o'zi bazada YO'Q —
 * faqat SHA-256 xeshi. Har ishlatilganda yangisi beriladi (rotatsiya),
 * eskisi qayta kelsa hisobning barcha tokenlari bekor bo'ladi.
 *
 * Farqlar (egasining talabi, 21.09):
 *   - muddat 90 kun va SIRPANUVCHI: har yangilashda qaytadan 90 kun,
 *     ya'ni ilovadan foydalanayotgan xaridor hech qachon chiqarilmaydi;
 *   - `replacement_enc` — almashtirilgan tokenning 30 soniyalik "imtiyoz
 *     oynasi" uchun yangi refresh tokenning shifrlangan nusxasi. Tarmoq
 *     uzilib javob yetib bormasa, ilova AYNAN o'sha juftlikni qayta oladi
 *     va "o'g'irlik" deb chiqarib yuborilmaydi. Oyna o'tgach qiymat
 *     tozalanadi.
 */
@Table({ tableName: 'user_refresh_tokens', createdAt: 'created_at', updatedAt: false })
export class UserRefreshToken extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) user_id: number;
  @Column({ type: DataType.STRING(64), allowNull: false, unique: true }) token_hash: string;
  /** Berilgan paytdagi `users.token_version` — hisob bloklansa token o'ladi. */
  @Column({ type: DataType.INTEGER, allowNull: false }) token_version: number;
  @Column({ type: DataType.DATE, allowNull: false }) expires_at: Date;
  /** Muddat (kun): sayt 180, mobil 90. Yangilashda shu qiymat qayta qo'yiladi. */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 180 }) ttl_days: number;
  @Column({ type: DataType.DATE, allowNull: true }) revoked_at: Date | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) replaced_by_id: number | null;
  @Column({ type: DataType.DATE, allowNull: true }) replaced_at: Date | null;
  /** Almashtirilgan tokenning o'rniga berilgani (shifrlangan, 30 soniya). */
  @Column({ type: DataType.TEXT, allowNull: true }) replacement_enc: string | null;
  @Column({ type: DataType.DATE, allowNull: true }) last_used_at: Date | null;
  @Column({ type: DataType.STRING(64), allowNull: true }) ip: string | null;
  @Column({ type: DataType.STRING(500), allowNull: true }) user_agent: string | null;
  declare created_at: Date;
}
