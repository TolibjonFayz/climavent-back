import { ApiProperty } from '@nestjs/swagger';
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { Product } from 'src/products/model/product.model';
import { User } from 'src/users/model/user.model';
import { Characteristic } from 'src/characteristics/model/characteristic.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';

interface SelectedToCheckoutAtr {
  product_model: string;
  quantity: number;
  price: number;
  product_id: number;
  user_id: number;
  characteristic_id?: number;
  product_model_inside_id?: number;
}

@Table({ tableName: 'selected_to_checkout' })
export class SelectedToCheckoutModels extends Model<
  SelectedToCheckoutModels,
  SelectedToCheckoutAtr
> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @ApiProperty({ example: 'jajsdbnifuab', description: 'Product model' })
  @Column({ type: DataType.STRING })
  product_model: string;

  @ApiProperty({ example: 23, description: 'Product quantity' })
  @Column({ type: DataType.INTEGER })
  quantity: number;

  @ApiProperty({ example: 250000, description: 'Product price' })
  @Column({ type: DataType.INTEGER })
  price: number;

  @ForeignKey(() => Product)
  @ApiProperty({ example: 1, description: 'Product id' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  product_id: number;
  @BelongsTo(() => Product)
  product: Product;

  @ForeignKey(() => User)
  @ApiProperty({ example: 1, description: 'User id' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  user_id: number;
  @BelongsTo(() => User)
  user: User;

  // Savatdan buyurtmagacha yo'l shu jadval orqali o'tadi va variant
  // id'lari aynan shu yerda yo'qolardi (topshiriq №13, 4-band). Server
  // buyurtma narxini tanlangan variant bo'yicha hisoblashi uchun kerak.
  @ForeignKey(() => Characteristic)
  @ApiProperty({ example: 253, required: false, description: 'Model id' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  characteristic_id: number;
  @BelongsTo(() => Characteristic)
  characteristic: Characteristic;

  @ForeignKey(() => ProductModelInside)
  @ApiProperty({ example: 331, required: false, description: 'SAP varianti id' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  product_model_inside_id: number;
  @BelongsTo(() => ProductModelInside)
  inside: ProductModelInside;
}
