import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface OtpAttr {
  id: number;
  otp: number;
  phone_number: string;
  expiration_time: Date;
  verified: boolean;
  unique_id: string;
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

  @Column({ type: DataType.STRING })
  otp: string;

  @Column({ defaultValue: false })
  verified: boolean;

  @Column({})
  expiration_time: Date;

  @Column({ type: DataType.STRING })
  phone_number: string;
}
