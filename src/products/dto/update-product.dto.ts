import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateProductDto {
  @ApiProperty({
    example: 'Centrifugal fan type vs14-46',
    description: 'Name of product in uzbek',
  })
  @IsString()
  @IsNotEmpty()
  name_uz: string;

  @ApiProperty({
    example: 'Centrifugal fan type vs14-46',
    description: 'Name of product in russian',
  })
  @IsString()
  @IsNotEmpty()
  name_ru: string;

  @ApiProperty({
    example: 'Centrifugal fan type vs14-46',
    description: 'Name of product in english',
  })
  @IsString()
  @IsNotEmpty()
  name_en: string;

  @ApiProperty({
    example: 'Its great, good...',
    description: 'About the product in uzbek',
  })
  @IsString()
  @IsNotEmpty()
  description_short_uz: string;

  @ApiProperty({
    example: 'Its great, good...',
    description: 'About the product in russian',
  })
  @IsString()
  @IsNotEmpty()
  description_short_ru: string;

  @ApiProperty({
    example: 'Its great, good...',
    description: 'About the product in english',
  })
  @IsString()
  @IsNotEmpty()
  description_short_en: string;

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
