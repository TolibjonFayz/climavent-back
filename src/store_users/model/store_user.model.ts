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
  @Column({ type: DataType.STRING, allowNull: false })
  password_hash: string;

  @ApiProperty({ example: 'Anvar Karimov', required: false })
  @Column({ type: DataType.STRING, allowNull: true })
  full_name: string;

  @ApiProperty({ example: 'store_admin', enum: ['superadmin', 'store_admin'] })
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

  // Parol hash'i javobga TUSHMASIN — bitta joyda kafolatlaymiz, har bir
  // endpointda qo'lda o'chirishga tayanmaymiz.
  toJSON() {
    const values = { ...super.toJSON() } as Record<string, unknown>;
    delete values.password_hash;
    return values;
  }
}
