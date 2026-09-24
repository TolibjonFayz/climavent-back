import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

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

  // `required: false` MUHIM: `@IsOptional()` faqat validatsiyaga ta'sir
  // qiladi, OpenAPI esa `@ApiProperty` ni ko'rib maydonni MAJBURIY deb
  // yozardi. Shu sabab hujjatga qarab tekshirganda `producer` hamon
  // majburiy ko'rinardi, amalda esa emas edi (topshiriq №12, 5-band).
  @ApiProperty({
    example: 'Hisense',
    description: "Ishlab chiqaruvchi — berilmasa store.name dan olinadi",
    required: false,
  })
  // `producer` endi IXTIYORIY — berilmasa `store.name` dan to'ldiriladi.
  // Do'kon endi `store_id` orqali belgilanadi (topshiriq №10, 5-band).
  // Ustun hozircha o'chirilmaydi: eski mijozlar uni o'qishda davom etadi.
  @IsOptional()
  @IsString()
  producer?: string;

  // Mahsulotni vaqtincha sotuvdan olish uchun (topshiriq №14, 6-band).
  // Berilmasa `true` — mavjud mijozlar buzilmaydi.
  @ApiProperty({
    example: true,
    description: "Saytda ko'rinadimi. Standart: true",
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  // Topshiriq №37. Berilmasa — do'konning `default_currency` si. Almashtirilsa
  // narxlar AYLANTIRILMAYDI (javobda `prices_to_review`).
  @ApiProperty({ example: 'UZS', enum: ['USD', 'UZS'], required: false, description: 'Narx valyutasi' })
  @IsOptional()
  @IsIn(['USD', 'UZS'], { message: "currency USD yoki UZS bo'lsin" })
  currency?: 'USD' | 'UZS';

  @ApiProperty({ example: 2, description: "Do'kon id (MAJBURIY)" })
  @IsNumber()
  @IsNotEmpty({ message: "store_id majburiy — mahsulot do'konga bog'lanishi kerak" })
  store_id: number;

  @ApiProperty({ example: 1, description: 'Id of category' })
  @IsNumber()
  @IsNotEmpty()
  category_id: number;
}
