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
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  COURIER_DOCUMENT_TYPES,
  EMPLOYMENT_TYPES,
  FAILURE_REASONS,
  INCIDENT_TYPES,
  PAYMENT_METHODS,
  VEHICLE_OWNERS,
  VEHICLES,
} from '../constants';

const PHONE = /^\+998\d{9}$/;
const PHONE_MSG = "telefon +998XXXXXXXXX ko'rinishida bo'lsin";
// multipart/form-data da hamma maydon satr bo'lib keladi
const toNumber = ({ value }: { value: any }) => (value === '' || value === null || value === undefined ? undefined : Number(value));
const toBool = ({ value }: { value: any }) => (value === 'true' ? true : value === 'false' ? false : value);
// multipart da ro'yxat "1,2,3" satri yoki takrorlangan maydon bo'lib keladi
const toIntArray = ({ value }: { value: any }) => {
  if (value === undefined || value === null || value === '') return undefined;
  const arr = Array.isArray(value) ? value : String(value).split(',');
  return arr.map((v) => Number(String(v).trim())).filter((n) => Number.isFinite(n));
};

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

  @ApiProperty({ required: false, enum: EMPLOYMENT_TYPES, description: 'Bandlik turi — soliq va hujjatlar shunga bog\'liq' })
  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES as unknown as string[])
  employment_type?: string;

  @ApiProperty({ required: false, example: '12345678901234', description: 'JShShIR (14) yoki STIR (9)' })
  @IsOptional()
  @Matches(/^(\d{9}|\d{14})$/, { message: "tin 9 (STIR) yoki 14 (JShShIR) raqamdan iborat bo'lsin" })
  tin?: string;

  @ApiProperty({ required: false, example: ['B', 'C'], type: [String], description: 'Haydovchilik guvohnomasi toifalari' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(/^[A-Da-d][EPep1-9]?$/, { each: true, message: 'license_categories: A, B, C, D, BE, CE va h.k.' })
  license_categories?: string[];
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

  @ApiProperty({ required: false, enum: EMPLOYMENT_TYPES, description: 'Bandlik turi — soliq va hujjatlar shunga bog\'liq' })
  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES as unknown as string[])
  employment_type?: string;

  @ApiProperty({ required: false, example: '12345678901234', description: 'JShShIR (14) yoki STIR (9)' })
  @IsOptional()
  @Matches(/^(\d{9}|\d{14})$/, { message: "tin 9 (STIR) yoki 14 (JShShIR) raqamdan iborat bo'lsin" })
  tin?: string;

  @ApiProperty({ required: false, example: ['B', 'C'], type: [String], description: 'Haydovchilik guvohnomasi toifalari' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(/^[A-Da-d][EPep1-9]?$/, { each: true, message: 'license_categories: A, B, C, D, BE, CE va h.k.' })
  license_categories?: string[];
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

  // ——— topshiriq №26, 7-band: HVAC uskunasi ko'pincha og'ir va katta ———
  @ApiProperty({ required: false, example: 2, description: "Yuk ko'taruvchilar soni" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  loaders_needed?: number;

  @ApiProperty({ required: false, example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  floor?: number;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  has_elevator?: boolean;
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

  // ——— topshiriq №26, 3-band ———
  // B2B yetkazishda mijoz kompaniyasi tovarni o'z xodimi orqali qabul
  // qiladi, shuning uchun topshirish kodi har doim ham bo'lmaydi.
  @ApiProperty({ required: false, example: 'Sardor Rahimov', description: 'Tovarni qabul qilgan odam' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  received_by_name?: string;

  // ——— topshiriq №26, 10-band: fiskal chek sotuvchining zimmasida ———
  @ApiProperty({ required: false, enum: PAYMENT_METHODS })
  @IsOptional()
  @IsIn(PAYMENT_METHODS as unknown as string[])
  payment_method?: string;

  @ApiProperty({ required: false, description: 'Fiskal chek havolasi' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fiscal_receipt_url?: string;

  @ApiProperty({ required: false, description: 'Fiskal belgi' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fiscal_sign?: string;
}

// ============================================================ topshiriq №26

/** Olib ketish: tekshiruv, rasm va izoh (2-band). */
export class CourierPickupDto extends Geo {
  @ApiProperty({
    required: false,
    type: [Number],
    description: "Kuryer 'oldim' deb belgilagan qatorlar — HAMMASI bo'lishi shart",
  })
  @IsOptional()
  @Transform(toIntArray)
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  items_checked?: number[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

/** "Yetib keldim" (4-band). Holat o'zgarmaydi, SMS yuborilmaydi. */
export class ArrivedDto {
  @ApiProperty({ example: 41.311081 })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 69.240562 })
  @Type(() => Number)
  @IsLongitude()
  lng: number;
}

/** Hodisa: shikast, avariya, o'g'irlik (9-band). */
export class IncidentDto {
  @ApiProperty({ enum: INCIDENT_TYPES })
  @IsIn(INCIDENT_TYPES as unknown as string[])
  type: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

/** Kuryer transporti (1a-band). */
export class CourierVehicleDto {
  @ApiProperty({ example: 'car', enum: VEHICLES })
  @IsIn(VEHICLES as unknown as string[])
  vehicle_type: string;

  @ApiProperty({ required: false, example: '01A123BC', description: "foot / bike da bo'sh bo'lishi mumkin" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  plate?: string;

  @ApiProperty({ required: false, example: 'Chevrolet Damas' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @ApiProperty({ required: false, example: 'oq' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  color?: string;

  @ApiProperty({ required: false, example: 700 })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @Max(100000)
  capacity_kg?: number;

  @ApiProperty({ required: false, example: 3.5 })
  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  @Max(1000)
  capacity_m3?: number;

  @ApiProperty({ example: 'own', enum: VEHICLE_OWNERS })
  @IsIn(VEHICLE_OWNERS as unknown as string[])
  owner: string;
}

export class UpdateCourierVehicleDto {
  @ApiProperty({ required: false, enum: VEHICLES })
  @IsOptional()
  @IsIn(VEHICLES as unknown as string[])
  vehicle_type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  plate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @Max(100000)
  capacity_kg?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  @Max(1000)
  capacity_m3?: number;

  @ApiProperty({ required: false, enum: VEHICLE_OWNERS })
  @IsOptional()
  @IsIn(VEHICLE_OWNERS as unknown as string[])
  owner?: string;
}

export class RejectVehicleDto {
  @ApiProperty({ example: 'Texpasport rasmi o\'qilmaydi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

/** Hujjat turi (1-band) — multipart bilan keladi. */
export class CourierDocumentDto {
  @ApiProperty({ enum: COURIER_DOCUMENT_TYPES })
  @IsIn(COURIER_DOCUMENT_TYPES as unknown as string[])
  type: string;

  @ApiProperty({ required: false, description: "Texpasport uchun — qaysi transportniki" })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  vehicle_id?: number;
}

/** Smena (8-band). Smena boshida transport tanlanadi. */
export class ShiftStartDto extends Geo {
  @ApiProperty({ example: 12, description: 'Tasdiqlangan transport id' })
  @Transform(toNumber)
  @IsInt()
  vehicle_id: number;
}

export class ShiftEndDto extends Geo {}

/** Yetkazish tarifi (6-band). */
export class CourierRateDto {
  @ApiProperty({ required: false, nullable: true, description: 'null — platforma tarifi (faqat superadmin)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  store_id?: number | null;

  @ApiProperty({ example: 'car', enum: VEHICLES })
  @IsIn(VEHICLES as unknown as string[])
  vehicle_type: string;

  @ApiProperty({ example: 25000 })
  @IsInt()
  @Min(0)
  base_fee: number;

  @ApiProperty({ example: 3000, description: "Har km uchun" })
  @IsInt()
  @Min(0)
  per_km: number;

  @ApiProperty({ example: 10000, description: "Qavatga ko'tarish (liftsiz har qavat)" })
  @IsInt()
  @Min(0)
  floor_fee: number;

  @ApiProperty({ example: 5000, description: 'Har 15 daqiqa kutish' })
  @IsInt()
  @Min(0)
  wait_fee_per_15min: number;
}

/** Kuryer bilan hisob-kitob (6-band). */
export class CourierPayoutDto {
  @ApiProperty({ example: 1200000 })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ required: false, example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  period_from?: string;

  @ApiProperty({ required: false, example: '2026-09-15' })
  @IsOptional()
  @IsDateString()
  period_to?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
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

  // GPS'dan kelgan yo'nalish ikki nuqtadan hisoblanganidan ANIQROQ —
  // xaritadagi mashinacha to'g'ri tomonga buriladi (topshiriq №26, 5-band).
  @ApiProperty({ required: false, example: 245, description: "Yo'nalish, 0–360 daraja" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  @ApiProperty({ required: false, example: 8.3, description: 'Tezlik, m/s' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(120)
  speed?: number;
}

/**
 * Sinov push (topshiriq №32, 4-band). Faqat SERVIS KALITI bilan kerak:
 * kirgan hisob tokeni bilan chaqirilsa — o'sha hisobning o'zi.
 */
export class DeviceTestDto {
  @ApiProperty({ required: false, enum: ['store_user', 'user'] })
  @IsOptional()
  @IsIn(['store_user', 'user'])
  owner_type?: 'store_user' | 'user';

  @ApiProperty({ required: false, example: 48 })
  @IsOptional()
  @IsInt()
  @Min(1)
  owner_id?: number;

  @ApiProperty({
    required: false,
    example: 1,
    description: "Yangi buyurtmadagi kabi: do'konning faol store_admin hisoblariga",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  store_id?: number;
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
