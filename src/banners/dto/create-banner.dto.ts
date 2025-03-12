import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateBannerDto {
  @ApiProperty({
    example: 'Konditsoner',
    description: 'Name of the banner in uzb',
  })
  @IsString()
  @IsNotEmpty()
  title_uz: string;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Name of the banner in russian',
  })
  @IsString()
  @IsNotEmpty()
  title_ru: string;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Name of the banner in english',
  })
  @IsString()
  @IsNotEmpty()
  title_en: string;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Name of the banner in uzb',
  })
  @IsString()
  @IsNotEmpty()
  text_uz: string;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Info of the banner in russian',
  })
  @IsString()
  @IsNotEmpty()
  text_ru: string;

  @ApiProperty({
    example: 'Konditsoner',
    description: 'Info of the banner in english',
  })
  @IsString()
  @IsNotEmpty()
  text_en: string;

  @ApiProperty({
    example: 'something.jpg',
    description: 'URL of image',
  })
  @IsString()
  @IsNotEmpty()
  img_url: string;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;

  @ApiProperty({ example: 1, description: 'Order id' })
  @IsNumber()
  @IsNotEmpty()
  orderid: number;
}
