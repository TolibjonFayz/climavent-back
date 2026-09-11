import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateOrderItemDto {
  @ApiProperty({ example: 1, description: 'Order id' })
  @IsNumber()
  @IsNotEmpty()
  order_id: number;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;

  @ApiProperty({ example: 'HVAUSDHVOH', description: 'Model of product' })
  @IsString()
  @IsNotEmpty()
  product_model: string;

  // Katalogdagi model. Berilmasa server `product_model` nomi bo'yicha shu
  // mahsulot ichidan topadi va o'zi yozib qo'yadi.
  @ApiProperty({
    example: 102,
    description: 'Katalogdagi model (characteristic) id — ixtiyoriy',
    required: false,
  })
  @IsOptional()
  @IsInt()
  product_model_id?: number;

  // Tanlangan SAP varianti. Bir nechta variantli modelda narx aynan shunga
  // bog'liq — berilmasa eng arzon variant narxi olinadi (saytdagi
  // standart tanlov bilan bir xil).
  @ApiProperty({
    example: 331,
    description: 'Tanlangan SAP varianti id — ixtiyoriy',
    required: false,
  })
  @IsOptional()
  @IsInt()
  product_model_inside_id?: number;

  @ApiProperty({ example: 1, description: 'Quantity of product' })
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  quantity: number;

  // E'TIBORGA OLINMAYDI (topshiriq №13, 4-band): narxni server katalog va
  // buyurtma paytidagi kurs bo'yicha o'zi hisoblaydi. Maydon eski mijozlar
  // buzilmasligi uchun qabul qilinadi, lekin yozilmaydi.
  @ApiProperty({
    example: 1200000,
    required: false,
    deprecated: true,
    description: "E'tiborga olinmaydi — narxni server hisoblaydi",
  })
  @IsOptional()
  @IsNumber()
  price?: number;
}
