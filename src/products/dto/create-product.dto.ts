import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateProductDto {
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

  @ApiProperty({ example: 20, description: 'Mahsulot soni' })
  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @ApiProperty({
    example: 'Hisense',
    description: 'Producer(maker) of product',
  })
  // `producer` endi IXTIYORIY — berilmasa `store.name` dan to'ldiriladi.
  // Do'kon endi `store_id` orqali belgilanadi (topshiriq №10, 5-band).
  // Ustun hozircha o'chirilmaydi: eski mijozlar uni o'qishda davom etadi.
  @IsOptional()
  @IsString()
  producer?: string;

  @ApiProperty({ example: 2, description: "Do'kon id (MAJBURIY)" })
  @IsNumber()
  @IsNotEmpty({ message: "store_id majburiy — mahsulot do'konga bog'lanishi kerak" })
  store_id: number;

  @ApiProperty({ example: 1, description: 'Id of category' })
  @IsNumber()
  @IsNotEmpty()
  category_id: number;
}
