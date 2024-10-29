import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateOrderItemDto } from './create-order_item.dto';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class UpdateOrderItemDto extends PartialType(CreateOrderItemDto) {
  @ApiProperty({ example: 1, description: 'User id' })
  @IsNumber()
  @IsNotEmpty()
  user_id: number;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;

  @ApiProperty({ example: 1, description: 'Quantity of product' })
  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @ApiProperty({ example: 1200000, description: 'Price of product' })
  @IsNumber()
  @IsNotEmpty()
  price: number;
}
