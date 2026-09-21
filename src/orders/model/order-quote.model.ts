import { ApiProperty } from '@nestjs/swagger';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

export interface QuoteItem {
  order_item_id: number;
  name: string | null;
  model: string | null;
  quantity: number;
  /**
   * So'mda, bir dona uchun. **`null`** — narxni sotuvchi hali bermagan
   * (topshiriq №28: saytda darhol chiqqan v1 da narxsiz qatorlar shunday
   * turadi va jamiga qo'shilmaydi).
   */
  price: number | null;
}

/**
 * Sotuvchi yuborgan narx taklifi — VERSIYALAR bilan (topshiriq №25, 2-band).
 *
 * Nega alohida jadval: `order_items.price` amaldagi narxni ko'rsatadi va
 * qayta yuborilganda o'zgaradi. Nizoda esa "17.09 da menga qaysi narx
 * aytilgan edi" degan savol chiqadi — shuning uchun har yuborish alohida
 * versiya bo'lib qoladi va HECH QACHON o'zgarmaydi.
 *
 * Aralash buyurtmada har do'kon O'Z qatorlariga alohida KP beradi, ya'ni
 * bitta buyurtmada bir nechta `store_id` bo'lishi mumkin.
 */
@Table({ tableName: 'order_quotes', timestamps: false })
export class OrderQuote extends Model {
  @ApiProperty({ example: 1 })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @ApiProperty({ example: 62 })
  @Column({ type: DataType.INTEGER, allowNull: false })
  order_id: number;

  @ApiProperty({ example: 2 })
  @Column({ type: DataType.INTEGER, allowNull: false })
  store_id: number;

  @ApiProperty({ example: 2, description: '1 dan boshlanadi; har qayta yuborish — yangi versiya' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  version: number;

  @ApiProperty({ description: 'Qatorlar nusxasi: nom, model, soni, narx' })
  @Column({ type: DataType.JSONB, allowNull: false })
  items: QuoteItem[];

  @ApiProperty({ example: '2026-09-27' })
  @Column({ type: DataType.DATEONLY, allowNull: false })
  valid_until: string;

  @ApiProperty({ required: false, example: '2 hafta, Toshkent bo\'ylab bepul' })
  @Column({ type: DataType.STRING(500), allowNull: true })
  delivery_terms: string | null;

  @ApiProperty({ required: false, example: "50% oldindan, bank o'tkazmasi" })
  @Column({ type: DataType.STRING(500), allowNull: true })
  payment_terms: string | null;

  @ApiProperty({ required: false })
  @Column({ type: DataType.TEXT, allowNull: true })
  note: string | null;

  @ApiProperty({ required: false, description: "Yuborgan do'kon hisobi (store_users.id)" })
  @Column({ type: DataType.INTEGER, allowNull: true })
  sent_by: number | null;

  @ApiProperty({ example: '2026-09-17T10:00:00.000Z' })
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  sent_at: Date;
}
