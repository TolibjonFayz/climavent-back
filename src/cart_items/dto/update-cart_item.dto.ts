import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateCartItemDto } from './create-cart_item.dto';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class UpdateCartItemDto extends PartialType(CreateCartItemDto) {
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
}
