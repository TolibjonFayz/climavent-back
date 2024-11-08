import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateCartItemDto {
  @ApiProperty({ example: 1, description: 'Cart id' })
  @IsNumber()
  @IsNotEmpty()
  cart_id: number;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;

  @ApiProperty({ example: 543000, description: 'Product price' })
  @IsNumber()
  @IsNotEmpty()
  price: number;

  @ApiProperty({
    example: 'ВНВ243.1-078-050-02-2,2-04-1',
    description: 'Product model name',
  })
  @IsString()
  @IsNotEmpty()
  product_model: string;

  @ApiProperty({ example: 52, description: 'Quantity of product' })
  @IsNumber()
  @IsNotEmpty()
  quantity: number;
}
