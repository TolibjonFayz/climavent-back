import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PRICE_TYPES, SERVICE_UNITS } from './models';

// DIQQAT (`whitelist: true`): har maydonda validator bo'lishi SHART — aks
// holda u tanadan jimgina olib tashlanadi.

export class ServiceCategoryDto {
  @ApiProperty({ example: 'installation', description: "Lotin, kichik harf va _ ; usta ko'nikmasi ham shu" })
  @Matches(/^[a-z][a-z0-9_]{1,29}$/, { message: 'key: kichik lotin harflari, raqam va _ (2–30)' })
  key: string;

  @ApiProperty({ example: "O'rnatish" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name_uz: string;

  @ApiProperty({ required: false, example: 'Установка' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name_ru?: string;

  @ApiProperty({ required: false, example: 'Installation' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name_en?: string;

  @ApiProperty({ required: false, example: 'build' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string;

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @IsInt()
  sort?: number;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateServiceCategoryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name_uz?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name_ru?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name_en?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  sort?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class VariantDto {
  @ApiProperty({ example: '7–9 ming BTU' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name_uz: string;

  @ApiProperty({ required: false, example: '7–9 тыс. BTU' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name_ru?: string;

  @ApiProperty({ required: false, example: '7–9k BTU' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name_en?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 450000,
    description: "So'm, butun son. `fixed` — majburiy; `from` — \"…dan\" narx; `quote` — null",
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(10_000_000_000)
  price_uzs?: number | null;

  @ApiProperty({ required: false, example: 0 })
  @IsOptional()
  @IsInt()
  sort?: number;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateVariantDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name_uz?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name_ru?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name_en?: string;

  @ApiProperty({ required: false, nullable: true, description: "Narx — `prices.edit` kerak" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(10_000_000_000)
  price_uzs?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  sort?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class CreateServiceDto {
  @ApiProperty({ required: false, example: 3, description: "Superadmin uchun majburiy; hamkor uchun — o'z do'koni" })
  @IsOptional()
  @IsInt()
  store_id?: number;

  @ApiProperty({ example: 1, description: 'Xizmat turi (`service_categories.id`) — yoki `category_key`' })
  @IsOptional()
  @IsInt()
  category_id?: number;

  @ApiProperty({ required: false, example: 'installation' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  category_key?: string;

  @ApiProperty({ example: 'Split konditsioner o\'rnatish' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name_uz: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name_ru?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name_en?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description_uz?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description_ru?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description_en?: string;

  @ApiProperty({ enum: PRICE_TYPES, example: 'fixed' })
  @IsIn(PRICE_TYPES as unknown as string[], { message: `price_type: ${PRICE_TYPES.join(', ')}` })
  price_type: string;

  @ApiProperty({ enum: SERVICE_UNITS, example: 'piece', required: false })
  @IsOptional()
  @IsIn(SERVICE_UNITS as unknown as string[], { message: `unit: ${SERVICE_UNITS.join(', ')}` })
  unit?: string;

  @ApiProperty({ required: false, nullable: true, example: 100000, description: "`from` uchun chiqish haqi (so'm); null — bepul" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  visit_fee_uzs?: number | null;

  @ApiProperty({ required: false, nullable: true, example: 120 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(60 * 24 * 30)
  duration_minutes?: number | null;

  @ApiProperty({ required: false, example: 12, description: 'Ishga kafolat (oy); 0 — yo\'q' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  warranty_months?: number;

  @ApiProperty({ required: false, type: [String], description: 'Rasm havolalari (POST /api/images/upload-image)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  photos?: string[];

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({ required: false, example: 0 })
  @IsOptional()
  @IsInt()
  sort?: number;

  @ApiProperty({
    required: false,
    type: [VariantDto],
    description: "Variantlar. Berilmasa bitta variant yaratiladi (nomi — xizmat nomi, narxi — `price_uzs`)",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants?: VariantDto[];

  @ApiProperty({ required: false, nullable: true, example: 450000, description: 'Variantsiz yaratishda — yagona variant narxi' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(10_000_000_000)
  price_uzs?: number | null;
}

export class UpdateServiceDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  category_id?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name_uz?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name_ru?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name_en?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description_uz?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description_ru?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description_en?: string;

  @ApiProperty({ required: false, enum: PRICE_TYPES })
  @IsOptional()
  @IsIn(PRICE_TYPES as unknown as string[], { message: `price_type: ${PRICE_TYPES.join(', ')}` })
  price_type?: string;

  @ApiProperty({ required: false, enum: SERVICE_UNITS })
  @IsOptional()
  @IsIn(SERVICE_UNITS as unknown as string[], { message: `unit: ${SERVICE_UNITS.join(', ')}` })
  unit?: string;

  @ApiProperty({ required: false, nullable: true, description: 'Narx — `prices.edit` kerak' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  visit_fee_uzs?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(60 * 24 * 30)
  duration_minutes?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  warranty_months?: number;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  photos?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  sort?: number;
}

export class ServiceLinkDto {
  @ApiProperty({ required: false, nullable: true, example: 19, description: "null — mijoz variantni o'zi tanlaydi" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  variant_id?: number | null;

  @ApiProperty({ required: false, example: 4, description: "Tovar bo'limi — yoki `product_id`" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  category_id?: number | null;

  @ApiProperty({ required: false, example: 225 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  product_id?: number | null;
}

export class ServiceLinksDto {
  @ApiProperty({ type: [ServiceLinkDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ServiceLinkDto)
  links: ServiceLinkDto[];
}

export class ServiceAreaDto {
  @ApiProperty({ example: 'tashkent_city', description: '`GET /api/regions` dagi viloyat kodi' })
  @IsString()
  @MaxLength(40)
  region_code: string;

  @ApiProperty({ required: false, nullable: true, example: 'yunusobod', description: "null — butun viloyat" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(40)
  district_code?: string | null;
}

export class ServiceAreasDto {
  @ApiProperty({ type: [ServiceAreaDto] })
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => ServiceAreaDto)
  areas: ServiceAreaDto[];
}

