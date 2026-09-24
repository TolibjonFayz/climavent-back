import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsHexColor,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateStoreDto {
  @ApiProperty({ example: 'Jihozvent' })
  @IsString()
  @IsNotEmpty({ message: "name bo'sh bo'lmasligi kerak" })
  name: string;

  // Sayt URL manzilida ishlatiladi — keyin o'zgartirish og'riqli,
  // shuning uchun format qat'iy (bazada ham CHECK constraint bor).
  @ApiProperty({ example: 'jihozvent', description: "Kichik harf, a-z0-9-" })
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: "slug faqat kichik harf, raqam va defisdan iborat bo'lsin",
  })
  slug: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description_uz?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description_ru?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description_en?: string;

  @ApiProperty({ required: false, description: 'POST /images/upload-image dan olingan havola' })
  @IsOptional()
  @IsString()
  logo_url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telegram?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiProperty({ required: false, example: '#2563eb' })
  @IsOptional()
  @IsHexColor({ message: "color '#RRGGBB' ko'rinishida bo'lsin" })
  color?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;

  // Topshiriq №37: yangi mahsulotning standart narx valyutasi. Do'kon admini
  // o'z do'konida o'zgartira oladi. Mavjud mahsulotlarga TA'SIR QILMAYDI.
  @ApiProperty({ required: false, enum: ['USD', 'UZS'], default: 'USD' })
  @IsOptional()
  @IsIn(['USD', 'UZS'], { message: "default_currency USD yoki UZS bo'lsin" })
  default_currency?: 'USD' | 'UZS';

  // KP hujjatidagi shartlar (topshiriq №33, 5-band)
  @ApiProperty({ required: false, nullable: true, example: "Toshkent bo'ylab bepul, 3–5 ish kuni" })
  @IsOptional() @IsString() @MaxLength(500)
  default_delivery_terms?: string | null;

  @ApiProperty({ required: false, nullable: true, example: "100% oldindan, bank o'tkazmasi" })
  @IsOptional() @IsString() @MaxLength(500)
  default_payment_terms?: string | null;

  // ------------------------------------------------ rekvizitlar (№16, 8-band)
  // Ochiq (saytda ko'rinadi): legal_name, tin. Qolganlari yopiq —
  // `store_requisites` jadvalida. Kim o'zgartira olishi — `StoresService.update`.

  @ApiProperty({ required: false, nullable: true, example: '"AIRCOOL TASHKENT" MChJ' })
  @IsOptional() @IsString() @MaxLength(255)
  legal_name?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '305123456', description: 'STIR: 9 raqam (YaTT: 9 yoki 14)' })
  @IsOptional() @Matches(/^(\d{9}|\d{14})$/, { message: "tin 9 yoki 14 raqam bo'lsin" })
  tin?: string | null;

  @ApiProperty({ required: false, nullable: true, enum: ['llc', 'jsc', 'other_legal_entity', 'sole_proprietor'] })
  @IsOptional() @IsIn(['llc', 'jsc', 'other_legal_entity', 'sole_proprietor'])
  legal_form?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  legal_address?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @IsString() @MaxLength(255)
  director_name?: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'Kapitalbank' })
  @IsOptional() @IsString() @MaxLength(255)
  bank_name?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '20208000900123456001' })
  @IsOptional() @Matches(/^\d{20}$/, { message: "bank_account 20 raqam bo'lsin" })
  bank_account?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '01088' })
  @IsOptional() @Matches(/^\d{5}$/, { message: "bank_mfo 5 raqam bo'lsin" })
  bank_mfo?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @IsBoolean()
  vat_payer?: boolean | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @Matches(/^\d{6,20}$/, { message: "vat_code faqat raqam bo'lsin" })
  vat_code?: string | null;

  @ApiProperty({ required: false, nullable: true, enum: ['manufacturer', 'distributor', 'dealer', 'reseller'] })
  @IsOptional() @IsIn(['manufacturer', 'distributor', 'dealer', 'reseller'])
  business_type?: string | null;
}
