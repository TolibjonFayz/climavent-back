import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { VEHICLE_OWNERS, VEHICLES } from 'src/deliveries/constants';
import { APPLICATION_DOC_TYPES, EMPLOYMENT } from './models';

// DIQQAT (`whitelist: true`): har maydonda validator bo'lishi SHART.

export class AppRegionDto {
  @ApiProperty({ example: 'tashkent_region' })
  @IsString()
  @MaxLength(40)
  region_code: string;

  @ApiProperty({ required: false, nullable: true, example: 'chirchiq' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(40)
  district_code?: string | null;
}

export class AppVehicleDto {
  @ApiProperty({ enum: VEHICLES, example: 'car' })
  @IsIn(VEHICLES as unknown as string[])
  vehicle_type: string;

  @ApiProperty({ required: false, example: '01A123BC' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  plate?: string;

  @ApiProperty({ required: false, example: 'Cobalt' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @ApiProperty({ required: false, example: 'oq' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  color?: string;

  @ApiProperty({ required: false, enum: VEHICLE_OWNERS, example: 'own' })
  @IsOptional()
  @IsIn(VEHICLE_OWNERS as unknown as string[])
  owner?: string;
}

const SKILL = /^[a-z][a-z0-9_]{1,29}$/;

export class CreateCourierApplicationDto {
  @ApiProperty({ example: 'Karimov Aziz' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  full_name: string;

  @ApiProperty({ example: '+998901234567', description: 'Login ham shu (998901234567)' })
  @Matches(/^\+998\d{9}$/, { message: "phone +998XXXXXXXXX ko'rinishida bo'lsin" })
  phone: string;

  @ApiProperty({ example: '1996-04-12' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "birth_date YYYY-MM-DD ko'rinishida bo'lsin" })
  birth_date: string;

  @ApiProperty({ example: 'kuchli-parol-123', description: '≥ 8 belgi' })
  @IsString()
  @MinLength(8, { message: "password kamida 8 belgi" })
  @MaxLength(72)
  password: string;

  @ApiProperty({ example: ['delivery', 'installation'], type: [String] })
  @IsArray()
  @ArrayMinSize(1, { message: "skills bo'sh bo'lmasin" })
  @ArrayMaxSize(20)
  @Matches(SKILL, { each: true, message: 'skills: kichik lotin harflari va _' })
  skills: string[];

  @ApiProperty({ type: [AppRegionDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'regions: kamida bitta hudud' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AppRegionDto)
  regions: AppRegionDto[];

  @ApiProperty({ enum: EMPLOYMENT, example: 'self_employed' })
  @IsIn(EMPLOYMENT as unknown as string[], { message: 'employment_type: self_employed yoki ip' })
  employment_type: string;

  @ApiProperty({ example: '31204961234567', description: 'JShShIR (14) yoki STIR (9)' })
  @Matches(/^(\d{9}|\d{14})$/, { message: "tin 9 (STIR) yoki 14 (JShShIR) raqam" })
  tin: string;

  @ApiProperty({ type: AppVehicleDto, required: false, nullable: true, description: "skills da delivery bo'lsa majburiy" })
  @IsOptional()
  @ValidateNested()
  @Type(() => AppVehicleDto)
  vehicle?: AppVehicleDto | null;

  @ApiProperty({ required: false, example: ['B'], type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(/^[A-Da-d][EPep1-9]?$/, { each: true, message: 'license_categories: A, B, C, D, BE, CE va h.k.' })
  license_categories?: string[];

  @ApiProperty({ required: false, example: "5 yil split o'rnatish, Midea va Gree" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  experience?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  comment?: string | null;

  @ApiProperty({ example: [81, 82, 83], type: [Number] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  document_ids: number[];

  @ApiProperty({ example: '1.0' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  offer_version: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  offer_accepted: boolean;

  @ApiProperty({ required: false, example: 'uz', enum: ['uz', 'ru', 'en'], description: 'Qaror push matni tili' })
  @IsOptional()
  @IsIn(['uz', 'ru', 'en'])
  lang?: string;

  @ApiProperty({ required: false, example: 'fcm…' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(512)
  push_token?: string | null;

  @ApiProperty({ required: false, example: 'android', enum: ['android', 'ios', 'web'] })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(['android', 'ios', 'web'])
  push_platform?: string | null;
}

/** `needs_info` da to'ldirish — qismiy (telefon, parol va oferta o'zgarmaydi). */
export class ResubmitCourierApplicationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  full_name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "birth_date YYYY-MM-DD ko'rinishida bo'lsin" })
  birth_date?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @Matches(SKILL, { each: true, message: 'skills: kichik lotin harflari va _' })
  skills?: string[];

  @ApiProperty({ required: false, type: [AppRegionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AppRegionDto)
  regions?: AppRegionDto[];

  @ApiProperty({ required: false, enum: EMPLOYMENT })
  @IsOptional()
  @IsIn(EMPLOYMENT as unknown as string[])
  employment_type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^(\d{9}|\d{14})$/, { message: "tin 9 (STIR) yoki 14 (JShShIR) raqam" })
  tin?: string;

  @ApiProperty({ required: false, type: AppVehicleDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => AppVehicleDto)
  vehicle?: AppVehicleDto | null;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(/^[A-Da-d][EPep1-9]?$/, { each: true, message: 'license_categories: A, B, C, D, BE, CE va h.k.' })
  license_categories?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  experience?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  comment?: string | null;

  @ApiProperty({ required: false, type: [Number], description: 'Yangi hujjatlar (eski ro\'yxat bilan yuborilsa ham bo\'ladi)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  document_ids?: number[];

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(512)
  push_token?: string | null;

  @ApiProperty({ required: false, enum: ['android', 'ios', 'web'] })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(['android', 'ios', 'web'])
  push_platform?: string | null;
}

export class UploadAppDocumentDto {
  @ApiProperty({ enum: APPLICATION_DOC_TYPES, example: 'passport' })
  @IsIn(APPLICATION_DOC_TYPES as unknown as string[], { message: `type: ${APPLICATION_DOC_TYPES.join(', ')}` })
  type: string;
}

export class ApproveCourierApplicationDto {
  @ApiProperty({ required: false, nullable: true, example: null, description: "null — platforma kuryeri" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  store_id?: number | null;

  @ApiProperty({ required: false, type: [String], description: "Superadmin tuzatishi (malaka tasdiqlanmagan ko'nikmani olib tashlash)" })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @Matches(SKILL, { each: true })
  skills?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(/^[A-Da-d][EPep1-9]?$/, { each: true })
  license_categories?: string[];
}

export class RejectCourierApplicationDto {
  @ApiProperty({ example: "Pasport rasmi o'qilmaydi va selfi mos emas" })
  @IsString()
  @MinLength(10, { message: 'reason kamida 10 belgi' })
  @MaxLength(2000)
  reason: string;
}

export class RequestInfoCourierDto {
  @ApiProperty({ example: "Texpasport rasmi o'qilmaydi — qaytadan yuklang" })
  @IsString()
  @MinLength(10, { message: 'message kamida 10 belgi' })
  @MaxLength(2000)
  message: string;

  @ApiProperty({ required: false, type: [String], example: ['vehicle_registration'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(APPLICATION_DOC_TYPES as unknown as string[], { each: true })
  missing_documents?: string[];
}

export class CourierAppNoteDto {
  @ApiProperty({ required: false, nullable: true, example: "Qo'ng'iroq qilindi 28.09" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  admin_note?: string | null;
}
