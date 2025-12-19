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

  @ApiProperty({ example: 'Size info', description: 'Product sizes' })
  sizes: string;

  @ApiProperty({
    example: 'Size info as Json',
    description: 'Product sizes as Json',
  })
  sizesJson: string;

  @ApiProperty({
    example: 'Description info',
    description: 'Product description',
  })
  opisaniya: string;

  @ApiProperty({
    example: 'Description info as Json',
    description: 'Product description as Json',
  })
  opisaniyaJson: string;

  @ApiProperty({
    example: 'Purpose info',
    description: 'Product purpose/usage',
  })
  naznacheniya: string;

  @ApiProperty({
    example: 'Purpose info as Json',
    description: 'Product purpose/usage as Json',
  })
  naznacheniyaJson: string;

  @ApiProperty({
    example: 'Purpose info',
    description: 'Product marking/labeling',
  })
  markirovka: string;

  @ApiProperty({
    example: 'Product marking/labeling as Json',
    description: 'Product marking/labeling as Json',
  })
  markirovkaJson: string;

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
  fileid: string;

  @ApiProperty({ example: 1, description: 'Id of category' })
  category_id: number;
}
