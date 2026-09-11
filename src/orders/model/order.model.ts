import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { User } from 'src/users/model/user.model';
import { OrderItem } from 'src/order_items/model/order_item.model';

interface OrderAtr {
  user_id: number;
  totalAmount: number | null;
  status: string;
  location: string;
}

@Table({ tableName: 'orders' })
export class Order extends Model<Order, OrderAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ForeignKey(() => User)
  @ApiProperty({ example: 1, description: 'User id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  user_id: number;
  @BelongsTo(() => User)
  user: User;

  // Qatorlar yig'indisi (narx x soni) — SERVER hisoblaydi, har safar
  // qator qo'shilganda/o'zgarganda/o'chirilganda qayta hisoblanadi
  // (topshiriq №13, 4-band). Mijoz yuborgan qiymat e'tiborga olinmaydi.
  //
  // NULL — kamida bitta qatorning narxi noma'lum: qisman yig'indini
  // "summa" deb ko'rsatish yolg'on bo'lardi.
  //
  // BIGINT: INTEGER chegarasi ~2.15 mlrd so'm, sanoat uskunasi buyurtmasi
  // undan oshishi mumkin. Getter JSON'da son qaytaradi.
  @ApiProperty({
    example: 148692000,
    nullable: true,
    description: "Buyurtma summasi (so'm). null — narxi yozilmagan qator bor",
  })
  @Column({
    type: DataType.BIGINT,
    allowNull: true,
    get(this: Order) {
      const v = this.getDataValue('totalAmount');
      return v === null || v === undefined ? null : Number(v);
    },
  })
  totalAmount: number | null;

  @ApiProperty({ example: 1, description: 'Status of order' })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  status: string;

  @ApiProperty({ example: 'Location', description: 'Location of order' })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  location: string;

  @HasMany(() => OrderItem)
  orderItems: OrderItem;
}
