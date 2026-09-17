import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { FAILURE_REASONS, VEHICLES } from '../constants';

const PHONE = /^\+998\d{9}$/;
const PHONE_MSG = "telefon +998XXXXXXXXX ko'rinishida bo'lsin";
// multipart/form-data da hamma maydon satr bo'lib keladi
const toNumber = ({ value }: { value: any }) => (value === '' || value === null || value === undefined ? undefined : Number(value));
const toBool = ({ value }: { value: any }) => (value === 'true' ? true : value === 'false' ? false : value);

// ============================================================ kuryerlar
export class CreateCourierDto {
  @ApiProperty({ example: 'Aziz Karimov' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  full_name: string;

  @ApiProperty({ example: '+998901234567' })
  @Matches(PHONE, { message: PHONE_MSG })
  phone: string;

  @ApiProperty({ example: 'car', enum: VEHICLES })
  @IsIn(VEHICLES as unknown as string[])
  vehicle_type: string;

  @ApiProperty({ example: 2, required: false, nullable: true, description: "null — platforma kuryeri (faqat superadmin). Do'kon admini uchun o'z do'koni" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  store_id?: number | null;

  @ApiProperty({ example: 'kuryer_aziz', required: false, description: "Bo'lmasa telefondan: c998901234567" })
  @IsOptional()
  @Matches(/^[a-z0-9_.-]{3,50}$/, { message: "login: 3-50 belgi, kichik lotin harflari, raqam, _ . -" })
  login?: string;
}

export class UpdateCourierDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  full_name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(PHONE, { message: PHONE_MSG })
  phone?: string;

  @ApiProperty({ required: false, enum: VEHICLES })
  @IsOptional()
  @IsIn(VEHICLES as unknown as string[])
  vehicle_type?: string;

  @ApiProperty({ required: false, description: "false — tokenlari ham bekor bo'ladi" })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({ required: false, nullable: true, description: 'Faqat superadmin' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  store_id?: number | null;
}

export class CashHandoverDto {
  @ApiProperty({ example: 1500000 })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

// ============================================================ yetkazishlar (adminka)
class AddressFields {
  @ApiProperty({ required: false, enum: VEHICLES })
  @IsOptional()
  @IsIn(VEHICLES as unknown as string[])
  required_vehicle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pickup_address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsLatitude()
  pickup_lat?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsLongitude()
  pickup_lng?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  dropoff_address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsLatitude()
  dropoff_lat?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsLongitude()
  dropoff_lng?: number;

  @ApiProperty({ required: false, example: '2-kirish, 5-qavat, 18-xonadon, mo\'ljal: maktab' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  dropoff_details?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  recipient_name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(PHONE, { message: PHONE_MSG })
  recipient_phone?: string;

  @ApiProperty({ required: false, example: '2026-09-18T09:00:00+05:00' })
  @IsOptional()
  @IsDateString()
  window_from?: string;

  @ApiProperty({ required: false, example: '2026-09-18T13:00:00+05:00' })
  @IsOptional()
  @IsDateString()
  window_to?: string;

  @ApiProperty({ required: false, description: "Naqd olinadigan summa (so'm); 0 — oldindan to'langan" })
  @IsOptional()
  @IsInt()
  @Min(0)
  cod_amount?: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  delivery_fee?: number | null;
}

export class CreateDeliveryDto extends AddressFields {
  @ApiProperty({ example: 51 })
  @IsInt()
  order_id: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  store_id: number;

  @ApiProperty({ required: false, type: [Number], description: "Bo'lmasa — buyurtmaning shu do'kondagi hamma qatorlari" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  items?: number[];
}

export class UpdateDeliveryDto extends AddressFields {}

export class AssignDto {
  @ApiProperty({ example: 3 })
  @IsInt()
  courier_id: number;
}

export class CommentDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

// ============================================================ kuryer ilovasi
class Geo {
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(toNumber)
  @IsLatitude()
  lat?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(toNumber)
  @IsLongitude()
  lng?: number;
}

export class CourierActionDto extends Geo {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class CourierRejectDto extends Geo {
  @ApiProperty({ example: 'Mashina buzildi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  comment: string;
}

export class CourierDeliverDto extends Geo {
  @ApiProperty({ required: false, example: '4821' })
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'code 4 raqam' })
  code?: string;

  @ApiProperty({ required: false, description: "Naqd olingan summa (so'm). cod_amount > 0 bo'lsa majburiy" })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  cash_collected?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class CourierFailDto extends Geo {
  @ApiProperty({ enum: FAILURE_REASONS })
  @IsIn(FAILURE_REASONS as unknown as string[])
  failure_reason: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  failure_comment?: string;
}

export class CourierMeDto {
  @ApiProperty({ example: true })
  @Transform(toBool)
  @IsBoolean()
  is_online: boolean;
}

export class LocationDto {
  @ApiProperty({ example: 41.311081 })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 69.240562 })
  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @ApiProperty({ required: false, example: 12.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  accuracy?: number;
}

export class DeviceDto {
  @ApiProperty({ enum: ['ios', 'android', 'web'] })
  @IsIn(['ios', 'android', 'web'])
  platform: string;

  @ApiProperty({ example: 'fcm-token…' })
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  token: string;
}
