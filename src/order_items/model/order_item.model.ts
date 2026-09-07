import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';
import { Product } from 'src/products/model/product.model';
import { Order } from 'src/orders/model/order.model';
import { Characteristic } from 'src/characteristics/model/characteristic.model';

interface OrderItemAtr {
  order_id: number;
  product_id: number;
  product_model: string;
  product_model_id?: number;
  quantity: number;
  price: number;
}

@Table({ tableName: 'order-items' })
export class OrderItem extends Model<OrderItem, OrderItemAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ForeignKey(() => Order)
  @ApiProperty({ example: 1, description: 'Order id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  order_id: number;
  @BelongsTo(() => Order)
  order: Order;

  @ForeignKey(() => Product)
  @ApiProperty({ example: 1, description: 'Product id' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  product_id: number;
  @BelongsTo(() => Product)
  product: Product;

  // MATNLI nom — ataylab saqlanadi (topshiriq №11, 3-band). Model
  // katalogdan o'chirilsa ham buyurtmada aynan nima sotilgani ko'rinib
  // tursin. Statistika esa quyidagi FK orqali yig'iladi.
  @ApiProperty({ example: 'HVAUSDHVOH', description: 'Model of product' })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  product_model: string;

  // Katalogdagi modelga HAQIQIY bog'lanish. Ilgari faqat nom nusxasi
  // bor edi va "qaysi model ko'proq sotilgan" ni ishonchli hisoblab
  // bo'lmasdi: 40 ta qatordan 3 tasi katalogda umuman topilmadi, ustiga
  // 282 ta nomdan 17 tasi turli mahsulotlarda takrorlanadi.
  //
  // NULL bo'lishi mumkin: eski qatorlar bog'lanmagan (nomlar noaniq
  // bo'lgani uchun avtomatik backfill xato natija berardi), model
  // o'chirilsa esa bog'lanish uziladi — matnli nom qoladi.
  @ForeignKey(() => Characteristic)
  @ApiProperty({ example: 102, description: 'Katalogdagi model id', required: false })
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  product_model_id: number;
  @BelongsTo(() => Characteristic)
  characteristic: Characteristic;

  @ApiProperty({ example: 1, description: 'Quantity of product' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  quantity: number;

  @ApiProperty({ example: 1200000, description: 'Price of product' })
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  price: number;
}
