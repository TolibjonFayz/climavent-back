import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { StoreUser } from 'src/store_users/model/store_user.model';

// Ariza tarixi. Bazadagi trigger yozuvni o'chirishni va mazmunini
// o'zgartirishni taqiqlaydi — nizoda "kim, qachon, nima uchun" shu yerdan.
@Table({ tableName: 'seller_application_events', createdAt: 'created_at', updatedAt: false })
export class SellerApplicationEvent extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @Column({ type: DataType.INTEGER, allowNull: false }) application_id: number;
  @Column({ type: DataType.TEXT, allowNull: false }) type: string;

  // NULL — sotuvchi, tizim yoki servis kaliti
  @ForeignKey(() => StoreUser)
  @Column({ type: DataType.INTEGER, allowNull: true })
  actor_id: number;
  @BelongsTo(() => StoreUser, { foreignKey: 'actor_id', as: 'actor' })
  actor: StoreUser;
  // Login MATNI yozilgan paytda. `actor_id` hisob o'chganda NULL bo'ladi,
  // bu esa qoladi (trigger uni o'zgartirishni taqiqlaydi).
  @Column({ type: DataType.TEXT, allowNull: true }) actor_login: string;

  @Column({ type: DataType.TEXT, allowNull: true }) message: string;

  declare created_at: Date;
}
