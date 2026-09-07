import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

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

  // Ixtiyoriy: eski mijozlar yubormasa ham buyurtma o'tadi. Yuborilsa —
  // model bo'yicha sotuv statistikasi ishonchli yig'iladi.
  @ApiProperty({
    example: 102,
    description: 'Katalogdagi model (characteristic) id — ixtiyoriy',
    required: false,
  })
  @IsOptional()
  @IsInt()
  product_model_id?: number;

  @ApiProperty({ example: 1, description: 'Quantity of product' })
  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @ApiProperty({ example: 1200000, description: 'Price of product' })
  @IsNumber()
  @IsNotEmpty()
  price: number;
}
