import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    example: 'VR conditsioner tizimlari',
    description: 'Name of category',
  })
  @IsString()
  @IsNotEmpty()
  name_uz: string;

  @ApiProperty({
    example: 'VR air conditioning systems',
    description: 'Name of category in english',
  })
  @IsString()
  @IsNotEmpty()
  name_en: string;

  @ApiProperty({
    example: 'Системы кондиционирования VR',
    description: 'Name of category in russian',
  })
  @IsString()
  @IsNotEmpty()
  name_ru: string;

  /**
   * Ota kategoriya. `null` — ildiz.
   *
   * DIQQAT (topshiriq №29, 5-band): ilgari bu maydonda BIRORTA ham
   * class-validator dekoratori yo'q edi. Global `ValidationPipe`
   * `whitelist: true` bilan ishlaydi, ya'ni dekoratorsiz maydon tanadan
   * JIMGINA olib tashlanadi — shu sabab kategoriyaga ota belgilash yoki
   * uni bo'shatish API orqali umuman ishlamasdi (javob 200 qaytardi).
   *
   * `@IsOptional()` `null` ni ham o'tkazadi (class-validator qoidasi),
   * shuning uchun otani `null` bilan olib tashlash mumkin.
   */
  @ApiProperty({ example: 1, required: false, nullable: true, description: 'Ota kategoriya id (null — ildiz)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  category_id?: number | null;
}
