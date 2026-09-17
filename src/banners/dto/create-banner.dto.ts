import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

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

  // Eski nom. Yangi adminka `sort_order` yuboradi — servis ikkalasini
  // bir-biriga moslab yozadi, shuning uchun ikkalasi ham ixtiyoriy.
  @ApiProperty({ example: 1, required: false, description: 'Order id (eski nom)' })
  @IsOptional()
  @IsNumber()
  orderid?: number;

  // ——— Topshiriq №19, 5-band ———

  @ApiProperty({ example: true, required: false, description: "Mehmonga ko'rinadimi" })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  /**
   * Faqat ICHKI yo'l (`/...`) yoki to'liq `http(s)://` havola.
   *
   * `javascript:`, `data:` va sxemasiz `//boshqa-sayt` ataylab rad etiladi:
   * banner matni adminkadan keladi va u saytda bosiladigan havolaga
   * aylanadi — bu XSS va ochiq yo'naltirish uchun tayyor joy bo'lardi.
   */
  @ApiProperty({ example: '/category/konditsionerlar', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(\/(?!\/)[^\s]*|https?:\/\/[^\s]+)$/, {
    message: "link ichki yo'l (/...) yoki http(s):// havola bo'lishi kerak",
  })
  link?: string;

  @ApiProperty({ example: 1, required: false, description: 'Tartib (kichigi oldinda)' })
  @IsOptional()
  @IsInt()
  sort_order?: number;
}
