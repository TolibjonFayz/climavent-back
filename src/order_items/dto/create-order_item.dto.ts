import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

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

  @ApiProperty({ example: 1, description: 'Quantity of product' })
  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @ApiProperty({ example: 1200000, description: 'Price of product' })
  @IsNumber()
  @IsNotEmpty()
  price: number;
}
