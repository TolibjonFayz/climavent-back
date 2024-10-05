import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateProductDto {
  @ApiProperty({
    example: 'Centrifugal fan type vs14-46',
    description: 'Name of product',
  })
  name: string;

  @ApiProperty({
    example: 'Its great, good...',
    description: 'About the product',
  })
  description_short: string;

  @ApiProperty({ example: 20000, description: 'Price of product' })
  price: number;

  @ApiProperty({ example: 20, description: 'Mahsulot soni' })
  quantity: number;

  @ApiProperty({ example: 'Y36', description: 'Model of product' })
  model: string;

  @ApiProperty({
    example: 'Hisense',
    description: 'Producer(maker) of product',
  })
  producer: string;

  @ApiProperty({ example: 1, description: 'Id of category' })
  @IsNumber()
  @IsNotEmpty()
  category_id: number;
}
