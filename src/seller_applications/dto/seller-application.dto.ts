import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  BUSINESS_TYPES,
  DOCS_PER_APPLICATION,
  DOCUMENT_TYPES,
  LEGAL_FORMS,
} from '../constants';

// DIQQAT: STIR uzunligi huquqiy shaklga, `vat_code` esa `vat_payer` ga
// bog'liq — bu kesishgan tekshiruvlar servisda (`validateCrossFields`),
// chunki dekorator bitta maydonni ko'radi.

export class CreateSellerApplicationDto {
  @ApiProperty({ enum: LEGAL_FORMS, example: 'llc' })
  @IsIn(LEGAL_FORMS as unknown as string[], { message: "legal_form noto'g'ri" })
  legal_form: string;

  @ApiProperty({ example: '"AIRCOOL TASHKENT" MChJ' })
  @IsString() @IsNotEmpty({ message: 'legal_name majburiy' }) @MaxLength(255)
  legal_name: string;

  @ApiProperty({ example: '305123456', description: "9 raqam; YaTT uchun 9 yoki 14" })
  @IsString() @Matches(/^\d+$/, { message: "tin faqat raqamlardan iborat bo'lsin" })
  tin: string;

  @ApiProperty({ example: '2019-04-12', required: false, nullable: true })
  @IsOptional() @IsDateString({}, { message: "registered_at sana bo'lsin (YYYY-MM-DD)" })
  registered_at?: string | null;

  @ApiProperty({ example: 'Toshkent sh., Yunusobod t., ...' })
  @IsString() @IsNotEmpty({ message: 'legal_address majburiy' }) @MaxLength(500)
  legal_address: string;

  @ApiProperty({ example: 'Rahimov Botir' })
  @IsString() @IsNotEmpty({ message: 'director_name majburiy' }) @MaxLength(255)
  director_name: string;

  @ApiProperty({ example: 'Direktor', required: false, nullable: true })
  @IsOptional() @IsString() @MaxLength(120)
  director_position?: string | null;

  @ApiProperty({ example: 'Kapitalbank' })
  @IsString() @IsNotEmpty({ message: 'bank_name majburiy' }) @MaxLength(255)
  bank_name: string;

  @ApiProperty({ example: '20208000900123456001' })
  @IsString() @Matches(/^\d{20}$/, { message: "bank_account 20 raqam bo'lsin" })
  bank_account: string;

  @ApiProperty({ example: '01088' })
  @IsString() @Matches(/^\d{5}$/, { message: "bank_mfo 5 raqam bo'lsin" })
  bank_mfo: string;

  @ApiProperty({ example: true })
  @IsBoolean({ message: "vat_payer true yoki false bo'lsin" })
  vat_payer: boolean;

  @ApiProperty({ example: '326050012345', required: false, nullable: true })
  @IsOptional() @IsString() @Matches(/^\d{6,20}$/, { message: "vat_code faqat raqam bo'lsin" })
  vat_code?: string | null;

  @ApiProperty({ example: 'Aliyeva Nodira' })
  @IsString() @IsNotEmpty({ message: 'contact_name majburiy' }) @MaxLength(255)
  contact_name: string;

  @ApiProperty({ example: '+998901234567' })
  @IsString() @Matches(/^\+998\d{9}$/, { message: "contact_phone +998XXXXXXXXX ko'rinishida bo'lsin" })
  contact_phone: string;

  @ApiProperty({ example: 'sales@aircool.uz' })
  @IsEmail({}, { message: "contact_email noto'g'ri" }) @MaxLength(255)
  contact_email: string;

  @ApiProperty({ example: 'Aircool' })
  @IsString() @MinLength(2, { message: "store_name kamida 2 belgi" }) @MaxLength(60)
  store_name: string;

  @ApiProperty({ enum: BUSINESS_TYPES, example: 'distributor' })
  @IsIn(BUSINESS_TYPES as unknown as string[], { message: "business_type noto'g'ri" })
  business_type: string;

  @ApiProperty({ example: 'Konditsionerlar, VRF tizimlari' })
  @IsString() @IsNotEmpty({ message: 'categories majburiy' }) @MaxLength(1000)
  categories: string;

  @ApiProperty({ example: 'Midea, Gree', required: false, nullable: true })
  @IsOptional() @IsString() @MaxLength(1000)
  brands?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  warehouse_address?: string | null;

  @ApiProperty({ example: 'Toshkent sh. va viloyati', required: false, nullable: true })
  @IsOptional() @IsString() @MaxLength(1000)
  delivery_regions?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @IsString() @MaxLength(2000)
  comment?: string | null;

  @ApiProperty({ example: [41, 42, 43], description: `Yuklangan hujjatlar, eng ko'pi ${DOCS_PER_APPLICATION}` })
  @IsArray() @ArrayMaxSize(DOCS_PER_APPLICATION, { message: `Bitta arizada eng ko'pi ${DOCS_PER_APPLICATION} ta fayl` })
  @IsInt({ each: true })
  document_ids: number[];

  @ApiProperty({ example: '1.0' })
  @IsString() @IsNotEmpty({ message: 'offer_version majburiy' })
  offer_version: string;

  // `true` dan boshqa har qanday qiymat — 400 (servisda qat'iy `=== true`).
  @ApiProperty({ example: true })
  @IsBoolean({ message: 'offer_accepted true bo\'lishi shart' })
  offer_accepted: boolean;
}

// `needs_info` da sotuvchi to'ldiradi: hamma maydon ixtiyoriy, oferta esa
// qayta qabul qilinmaydi. DIQQAT: bu yerda maydonlarni QAYTA E'LON QILMANG —
// `PartialType` bergan ixtiyoriylik bekor bo'ladi (№9, №14 dagi tuzoq).
export class ResubmitSellerApplicationDto extends PartialType(
  OmitType(CreateSellerApplicationDto, ['offer_version', 'offer_accepted'] as const),
) {}

export class UploadDocumentDto {
  @ApiProperty({ enum: DOCUMENT_TYPES, example: 'passport' })
  @IsIn(DOCUMENT_TYPES as unknown as string[], { message: "type noto'g'ri" })
  type: string;
}

export class ApproveApplicationDto {
  @ApiProperty({ example: 'aircool' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{3,50}$/, {
    message: "login 3–50 belgi: lotin harf, raqam, _ . - bo'lsin",
  })
  login: string;

  @ApiProperty({ example: 'aircool', required: false, description: "Berilmasa do'kon nomidan yasaladi" })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: "slug faqat kichik harf, raqam va defisdan iborat bo'lsin",
  })
  slug?: string;
}

export class RejectApplicationDto {
  @ApiProperty({ example: "Taqdim etilgan guvohnoma boshqa kompaniyaga tegishli" })
  @IsString() @MinLength(10, { message: "reason kamida 10 belgi" }) @MaxLength(2000)
  reason: string;
}

export class RequestInfoDto {
  @ApiProperty({ example: 'Direktorni tayinlash qarori yuklanmagan' })
  @IsString() @MinLength(10, { message: "message kamida 10 belgi" }) @MaxLength(2000)
  message: string;
}

export class UpdateApplicationNoteDto {
  @ApiProperty({ example: "STIR soliq.uz da tekshirildi", nullable: true })
  @IsOptional() @IsString() @MaxLength(4000)
  admin_note: string | null;
}
