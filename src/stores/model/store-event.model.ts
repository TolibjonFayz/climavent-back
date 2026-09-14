import { Column, DataType, Model, Table } from 'sequelize-typescript';

// Do'kon rekvizitlari o'zgarishi tarixi (topshiriq №16, 8-band). Bank hisob
// raqamini almashtirish — to'lov firibgarligining klassik yo'li, shuning
// uchun kim, qachon va nimani o'zgartirgani yozib qo'yiladi.
@Table({ tableName: 'store_events', createdAt: 'created_at', updatedAt: false })
export class StoreEvent extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @Column({ type: DataType.INTEGER, allowNull: false }) store_id: number;
  @Column({ type: DataType.TEXT, allowNull: false }) type: string;
  @Column({ type: DataType.INTEGER, allowNull: true }) actor_id: number;
  // Hisob o'chirilsa `actor_id` NULL bo'ladi — login matni qoladi
  @Column({ type: DataType.TEXT, allowNull: true }) actor_login: string;
  @Column({ type: DataType.TEXT, allowNull: true }) message: string;
}
