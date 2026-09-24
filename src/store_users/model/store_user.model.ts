import { ApiProperty } from '@nestjs/swagger';
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { Store } from 'src/stores/model/store.model';

interface StoreUserAtr {
  store_id: number;
  login: string;
  password_hash: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

// Do'kon xodimlarining hisoblari. `users` jadvalidan ALOHIDA:
// `users` — xaridorlar (cart, likes, orders unga bog'langan), bu esa
// panelga kiradigan xodimlar. Ikki xil narsa — ikki xil jadval.
@Table({ tableName: 'store_users' })
export class StoreUser extends Model<StoreUser, StoreUserAtr> {
  @ApiProperty({ example: 1 })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  // NULL = superadmin: barcha do'konlarni ko'radi va boshqaradi.
  @ForeignKey(() => Store)
  @ApiProperty({ example: 2, required: false, description: "NULL = superadmin" })
  @Column({ type: DataType.INTEGER, allowNull: true })
  store_id: number;
  @BelongsTo(() => Store)
  store: Store;

  @ApiProperty({ example: 'jihozvent_admin' })
  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  login: string;

  // Ochiq parol HECH QACHON saqlanmaydi va HECH QACHON javobda qaytmaydi.
  // `toJSON` da ham chiqarib tashlanadi (pastga qarang).
  //
  // NULL bo'lishi mumkin (topshiriq №16): ariza tasdiqlanganda hisob
  // PAROLSIZ ochiladi, sotuvchi parolni bir martalik havola orqali o'zi
  // o'rnatadi. Parolsiz hisob bilan kirib bo'lmaydi (`StoreAuthService`).
  @Column({ type: DataType.STRING, allowNull: true })
  password_hash: string;

  // Parol o'rnatish tokenining SHA-256 XESHI (72 soat, bir martalik).
  @Column({ type: DataType.TEXT, allowNull: true })
  password_setup_token_hash: string;

  @Column({ type: DataType.DATE, allowNull: true })
  password_setup_expires_at: Date;

  @ApiProperty({ example: 'Anvar Karimov', required: false })
  @Column({ type: DataType.STRING, allowNull: true })
  full_name: string;

  @ApiProperty({ example: 'store_admin', enum: ['superadmin', 'store_admin', 'courier', 'store_staff'] })
  @Column({
    type: DataType.STRING,
    allowNull: false,
    defaultValue: 'store_admin',
  })
  role: string;

  // O'chirish o'rniga bloklash — tarix va audit saqlanib qoladi.
  @ApiProperty({ example: true })
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  is_active: boolean;

  @ApiProperty({ required: false })
  @Column({ type: DataType.DATE, allowNull: true })
  last_login_at: Date;

  // Do'kon xodimi (topshiriq №35): roli va telefoni. Faqat `store_staff` da.
  @ApiProperty({ required: false, nullable: true, example: 3 })
  @Column({ type: DataType.INTEGER, allowNull: true })
  store_role_id: number;

  @ApiProperty({ required: false, nullable: true, example: '+998901234567' })
  @Column({ type: DataType.STRING(13), allowNull: true })
  phone: string;

  // Parol almashganda oshadi — eski tokenlar (`tv` boshqa) 401 oladi (№17, 3-band)
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  token_version: number;

  // Parol hash'i javobga TUSHMASIN — bitta joyda kafolatlaymiz, har bir
  // endpointda qo'lda o'chirishga tayanmaymiz.
  toJSON() {
    const values = { ...super.toJSON() } as Record<string, unknown>;
    delete values.password_hash;
    delete values.password_setup_token_hash;
    return values;
  }
}
