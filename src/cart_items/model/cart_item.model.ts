import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { Cart } from 'src/cart/models/cart.model';
import { Product } from 'src/products/model/product.model';
import { Characteristic } from 'src/characteristics/model/characteristic.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';

interface CartItemAtr {
  cart_id: number;
  product_id: number;
  product_model: string;
  quantity: number;
  price: number | null;
  characteristic_id: number;
  product_model_inside_id: number;
}

@Table({ tableName: 'cart_item' })
export class CartItem extends Model<CartItem, CartItemAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ApiProperty({
    example: 'ВНВ243.1-078-050-02-2,2-04-1',
    description: 'Product model name',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  product_model: string;

  // NULL — narxi katalogda yo'q ("Narxi kelishiladi"). Topshiriq №25, 1-band:
  // narxsiz mahsulot ham savatga tushadi, narxni sotuvchi KP bilan beradi.
  @ApiProperty({ example: 543000, nullable: true, description: "Narx (so'm); null — narxi kelishiladi" })
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  price: number | null;

  @ForeignKey(() => Cart)
  @ApiProperty({ example: 1, description: 'Cart id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  cart_id: number;
  @BelongsTo(() => Cart)
  cart: Cart;

  @ForeignKey(() => Product)
  @ApiProperty({ example: 1, description: 'Product id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  product_id: number;
  @BelongsTo(() => Product)
  product: Product;

  // Qaysi model (characteristic) tanlangani — `product_model` MATNIga
  // qo'shimcha, haqiqiy bog'lanish. Statistika matn solishtirish emas,
  // id bo'yicha yig'iladi.
  @ForeignKey(() => Characteristic)
  @ApiProperty({ example: 305, description: 'Model (characteristic) id', required: false })
  @Column({ type: DataType.INTEGER, allowNull: true })
  characteristic_id: number;
  @BelongsTo(() => Characteristic)
  characteristic: Characteristic;

  // Qaysi SAP varianti tanlangani. NULL bo'lishi mumkin — 302 modeldan
  // 150 tasida umuman inside yo'q, eski savat qatorlari ham bog'lanmagan.
  @ForeignKey(() => ProductModelInside)
  @ApiProperty({ example: 981, description: 'SAP varianti id', required: false })
  @Column({ type: DataType.INTEGER, allowNull: true })
  product_model_inside_id: number;
  @BelongsTo(() => ProductModelInside)
  productModelInside: ProductModelInside;

  @ApiProperty({ example: 52, description: 'Quantity of product' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  quantity: number;
}
