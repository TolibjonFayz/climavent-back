import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({
    example: 'Centrifugal fan type vs14-46',
    description: 'Name of product',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'Its great, good...',
    description: 'About the product',
  })
  @IsString()
  @IsNotEmpty()
  description_short: string;

  @ApiProperty({ example: 20000, description: 'Price of product' })
  @IsNumber()
  @IsNotEmpty()
  price: number;

  @ApiProperty({ example: 20, description: 'Mahsulot soni' })
  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @ApiProperty({ example: 'Y36', description: 'Model of product' })
  @IsNotEmpty()
  @IsString()
  model: string;

  @ApiProperty({
    example: 'Hisense',
    description: 'Producer(maker) of product',
  })
  @IsNotEmpty()
  @IsString()
  producer: string;

  @ApiProperty({ example: 1, description: 'Id of category' })
  @IsNumber()
  @IsNotEmpty()
  category_id: number;
}
