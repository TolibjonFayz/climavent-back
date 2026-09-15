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
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';

interface OrderItemAtr {
  order_id: number;
  product_id: number;
  product_model: string;
  product_model_id?: number;
  product_model_inside_id?: number;
  quantity: number;
  price: number | null;
  regular_price?: number | null;
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

  // Aynan qaysi SAP varianti sotilgani (topshiriq №13, 4-band). Narx
  // variantga bog'liq, shuning uchun server to'g'ri narxni shu orqali
  // topadi. NULL — variantsiz model yoki eski qator.
  @ForeignKey(() => ProductModelInside)
  @ApiProperty({ example: 331, required: false, description: 'SAP varianti id' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  product_model_inside_id: number;
  @BelongsTo(() => ProductModelInside)
  inside: ProductModelInside;

  // Bir donaning so'mdagi narxi — BUYURTMA PAYTIDA SERVER hisoblaydi va
  // muhrlaydi (topshiriq №13, 4-band). Mijoz yuborgan narx e'tiborga
  // olinmaydi.
  //
  // NULL — katalogda narx yo'q ("so'rov bo'yicha"). 0 endi "narx yo'q"
  // ma'nosida yozilmaydi; eski qatorlardagi 0 lar tegilmagan.
  //
  // BIGINT: PostgreSQL uni satr qilib qaytaradi — getter JSON'da son
  // bo'lib qolishini ta'minlaydi.
  @ApiProperty({
    example: 1200000,
    nullable: true,
    description: "Bir dona narxi (so'm). null — narx yozilmagan",
  })
  @Column({
    type: DataType.BIGINT,
    allowNull: true,
    get(this: OrderItem) {
      const v = this.getDataValue('price');
      return v === null || v === undefined ? null : Number(v);
    },
  })
  price: number | null;

  // Qator yozilgan paytdagi ASOSIY narx (so'm) — aksiyasiz (topshiriq №15, 5-band).
  // `price < regular_price` bo'lsa qator aksiya narxida sotilgan. NULL — eski qatorlar.
  @ApiProperty({ example: 1500000, nullable: true, description: "Aksiyasiz narx (so'm)" })
  @Column({
    type: DataType.BIGINT,
    allowNull: true,
    get(this: OrderItem) {
      const v = this.getDataValue('regular_price');
      return v === null || v === undefined ? null : Number(v);
    },
  })
  regular_price: number | null;
}
