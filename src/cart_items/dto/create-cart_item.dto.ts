import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class CreateCartItemDto {
  @ApiProperty({ example: 1, description: 'Cart id' })
  @IsNumber()
  @IsNotEmpty()
  cart_id: number;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;

  @ApiProperty({ example: 52, description: 'Quantity of product' })
  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @ApiProperty({ example: 25000, description: 'Price of product' })
  @IsNumber()
  @IsNotEmpty()
  price: number;
}
