import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateBannerDto {
  @ApiProperty({
    required: false,
    example: 'Konditsoner',
    description: 'Name of the banner in uzb',
  })
  @IsOptional()
  @IsString()
  title_uz?: string;

  @ApiProperty({
    required: false,
    example: 'Konditsoner',
    description: 'Name of the banner in russian',
  })
  @IsOptional()
  @IsString()
  title_ru?: string;

  @ApiProperty({
    required: false,
    example: 'Konditsoner',
    description: 'Name of the banner in english',
  })
  @IsOptional()
  @IsString()
  title_en?: string;

  @ApiProperty({
    required: false,
    example: 'Konditsoner',
    description: 'Name of the banner in uzb',
  })
  @IsOptional()
  @IsString()
  text_uz?: string;

  @ApiProperty({
    required: false,
    example: 'Konditsoner',
    description: 'Info of the banner in russian',
  })
  @IsOptional()
  @IsString()
  text_ru?: string;

  @ApiProperty({
    required: false,
    example: 'Konditsoner',
    description: 'Info of the banner in english',
  })
  @IsOptional()
  @IsString()
  text_en?: string;

  @ApiProperty({
    required: false,
    example: 'something.jpg',
    description: 'URL of image',
  })
  @IsOptional()
  @IsString()
  img_url?: string;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsOptional()
  @IsNumber()
  product_id?: number;

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

  // ——— Faqat-rasm banner (2026-10-06) ———
  // `image_desktop_uz` — asosiy rasm (yangi bannerda majburiy, servis tekshiradi).
  // Qolganlari ixtiyoriy: ru/en bo'lmasa uz, telefon rasmi bo'lmasa desktop.

  @ApiProperty({ required: false, example: 'https://res.cloudinary.com/.../banner-desktop-uz.webp', description: 'desktop rasmi (uz), 11:4 (masalan 1760×640)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/, { message: 'image_desktop_uz: http(s):// havola yoki /yo\'l bo\'lishi kerak' })
  image_desktop_uz?: string;

  @ApiProperty({ required: false, example: 'https://res.cloudinary.com/.../banner-desktop-ru.webp', description: 'desktop rasmi (ru), 11:4 (masalan 1760×640)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/, { message: 'image_desktop_ru: http(s):// havola yoki /yo\'l bo\'lishi kerak' })
  image_desktop_ru?: string;

  @ApiProperty({ required: false, example: 'https://res.cloudinary.com/.../banner-desktop-en.webp', description: 'desktop rasmi (en), 11:4 (masalan 1760×640)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/, { message: 'image_desktop_en: http(s):// havola yoki /yo\'l bo\'lishi kerak' })
  image_desktop_en?: string;

  @ApiProperty({ required: false, example: 'https://res.cloudinary.com/.../banner-mobile-uz.webp', description: 'mobile rasmi (uz), 4:3 (masalan 800×600)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/, { message: 'image_mobile_uz: http(s):// havola yoki /yo\'l bo\'lishi kerak' })
  image_mobile_uz?: string;

  @ApiProperty({ required: false, example: 'https://res.cloudinary.com/.../banner-mobile-ru.webp', description: 'mobile rasmi (ru), 4:3 (masalan 800×600)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/, { message: 'image_mobile_ru: http(s):// havola yoki /yo\'l bo\'lishi kerak' })
  image_mobile_ru?: string;

  @ApiProperty({ required: false, example: 'https://res.cloudinary.com/.../banner-mobile-en.webp', description: 'mobile rasmi (en), 4:3 (masalan 800×600)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/, { message: 'image_mobile_en: http(s):// havola yoki /yo\'l bo\'lishi kerak' })
  image_mobile_en?: string;
}
