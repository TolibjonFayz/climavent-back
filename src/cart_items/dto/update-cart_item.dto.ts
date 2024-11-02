import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateCartItemDto } from './create-cart_item.dto';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateCartItemDto extends PartialType(CreateCartItemDto) {
  @ApiProperty({ example: 1, description: 'Cart id' })
  @IsNumber()
  @IsNotEmpty()
  cart_id: number;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;

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
