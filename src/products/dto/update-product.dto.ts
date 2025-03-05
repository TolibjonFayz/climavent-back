import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateProductDto {
  @ApiProperty({
    example: 'Centrifugal fan type vs14-46',
    description: 'Name of product in uzbek',
  })
  name_uz: string;

  @ApiProperty({
    example: 'Centrifugal fan type vs14-46',
    description: 'Name of product in russian',
  })
  name_ru: string;

  @ApiProperty({
    example: 'Centrifugal fan type vs14-46',
    description: 'Name of product in english',
  })
  name_en: string;

  @ApiProperty({
    example: 'Its great, good...',
    description: 'About the product in uzbek',
  })
  description_short_uz: string;

  @ApiProperty({
    example: 'Its great, good...',
    description: 'About the product in russian',
  })
  description_short_ru: string;

  @ApiProperty({
    example: 'Its great, good...',
    description: 'About the product in english',
  })
  description_short_en: string;

  @ApiProperty({ example: 20000, description: 'Price of product' })
  price: number;

  @ApiProperty({ example: 20, description: 'Mahsulot soni' })
  quantity: number;

  @ApiProperty({
    example: 'Hisense',
    description: 'Producer(maker) of product',
  })
  producer: string;

  @ApiProperty({ example: '76312sd', description: 'Id of the file' })
  @IsString()
  fileid: string;

  @ApiProperty({ example: 1, description: 'Id of category' })
  category_id: number;
}
