import { ApiProperty } from '@nestjs/swagger';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface StoreAtr {
  name: string;
  slug: string;
  is_active: boolean;
}

// Marketplace do'koni. Ilgari do'kon `products.producer` matni orqali
// ajratilardi — bu vaqtinchalik konvensiya edi. `producer` ustuni hali
// joyida (eski kod undan foydalanadi), lekin haqiqiy bog'lanish shu yerda.
@Table({ tableName: 'stores' })
export class Store extends Model<Store, StoreAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @ApiProperty({ example: 'Jihozvent', description: "Do'kon nomi" })
  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  name: string;

  @ApiProperty({ example: 'jihozvent', description: 'URL uchun slug' })
  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  slug: string;

  @ApiProperty({ example: true, description: "Do'kon faolmi" })
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  is_active: boolean;

  // Eslatma: `@HasMany(() => Product)` ATAYLAB yo'q. Store `forRoot`
  // modellari ro'yxatida (User unga havola qiladi), Product esa emas —
  // teskari bog'lanish qo'shilsa "Product has not been defined" xatosi
  // chiqadi. Kerakli yo'nalish baribir Product -> Store (BelongsTo).
}
