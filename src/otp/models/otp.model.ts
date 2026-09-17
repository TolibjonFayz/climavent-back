import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface OtpAttr {
  id: number;
  otp?: number;
  otp_hash?: string;
  phone_number: string;
  expiration_time: Date;
  verified: boolean;
  unique_id: string;
  attempts: number;
}

@Table({ tableName: 'otp' })
export class Otp extends Model<Otp, OtpAttr> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @Column({ type: DataType.STRING })
  unique_id: string;

  /**
   * ESKI ustun — endi YOZILMAYDI (topshiriq №19, 8-band).
   * Deploy paytida yo'lda qolgan kodlar tekshirilishi uchun qoldirilgan.
   */
  @Column({ type: DataType.STRING })
  otp: string;

  /**
   * SMS kodining xeshi (HMAC-SHA256). Ochiq kod bazada saqlanmaydi:
   * bazaga o'qish huquqi bo'lgan har kim istalgan raqamga kelgan kod bilan
   * kira olardi. Xesh faqat SOLISHTIRISH uchun — undan kodni tiklab
   * bo'lmaydi, kod esa SMS'da mijozning o'zida qoladi.
   */
  @Column({ type: DataType.STRING(64) })
  otp_hash: string;

  @Column({ defaultValue: false })
  verified: boolean;

  @Column({})
  expiration_time: Date;

  @Column({ type: DataType.STRING })
  phone_number: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  attempts: number;
}
