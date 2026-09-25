import { ApiProperty } from '@nestjs/swagger';
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
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { JOB_FAILURE_REASONS } from './models';

// DIQQAT (`whitelist: true`): har maydonda validator bo'lishi SHART.

/** Har usta amalida ixtiyoriy joylashuv — tarixga yoziladi. */
export class GeoDto {
  @ApiProperty({ required: false, example: 41.33 })
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiProperty({ required: false, example: 69.28 })
  @IsOptional()
  @IsLongitude()
  lng?: number;
}

export class JobCommentDto extends GeoDto {
  @ApiProperty({ required: false, example: 'Mijoz bilan telefonda kelishildi' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class JobRejectDto extends GeoDto {
  @ApiProperty({ example: "Bugun boshqa manzildaman", description: 'Sabab majburiy' })
  @IsString()
  @IsNotEmpty({ message: 'comment (sabab) majburiy' })
  @MaxLength(1000)
  comment: string;
}

export class JobAssignDto {
  @ApiProperty({ example: 7, description: '`couriers.id` — usta' })
  @IsInt()
  worker_id: number;
}

export class JobScheduleDto {
  @ApiProperty({ required: false, example: '2026-09-28T10:00:00+05:00', description: "Berilmasa — mijoz taklifi tasdiqlanadi" })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ required: false, example: '2026-09-28T13:00:00+05:00' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({
    required: false,
    example: false,
    description: "true — vaqt mijoz bilan (chat/telefonda) KELISHILGAN: darhol `confirmed`, mijoz tasdig'i kerak emas",
  })
  @IsOptional()
  @IsBoolean()
  agreed?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class UpdateJobDto {
  @ApiProperty({ required: false, example: 700000, description: "Ish joyida olinadigan naqd (oldindan to'langan bo'lsa 0)" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000_000)
  cod_amount?: number;

  @ApiProperty({ required: false, nullable: true, example: 41, description: 'Shu yetkazish bilan BIRGA (bitta odam olib borib o\'rnatadi)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  delivery_id?: number | null;
}

export class JobCancelDto {
  @ApiProperty({ required: false, example: 'Mijoz boshqa kunga qoldirdi' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class JobBeginDto extends GeoDto {
  @ApiProperty({ type: [String], description: '"Oldin" rasmlari — kamida 1 ta' })
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  photos_before: string[];
}

export class JobPriceDto extends GeoDto {
  @ApiProperty({ example: 850000, description: "Yakuniy summa (so'm) — mijoz tasdiqlashi kerak" })
  @IsInt()
  @Min(0)
  @Max(10_000_000_000)
  amount: number;

  @ApiProperty({ example: "Trassa 3 m uzun chiqdi, qo'shimcha kronshteyn", description: 'Sabab majburiy' })
  @IsString()
  @IsNotEmpty({ message: 'comment (sabab) majburiy' })
  @MaxLength(1000)
  comment: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  photos?: string[];
}

export class JobCompleteDto extends GeoDto {
  @ApiProperty({ required: false, example: '4821', description: 'Mijoz ilovasidagi 4 xonali kod' })
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'code 4 raqam' })
  code?: string;

  @ApiProperty({ required: false, type: [String], description: '"Keyin" rasmlari (kodsiz topshirishda majburiy + comment)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  photos_after?: string[];

  @ApiProperty({ required: false, example: 700000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  cash_collected?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class JobFailDto extends GeoDto {
  @ApiProperty({ enum: JOB_FAILURE_REASONS })
  @IsIn(JOB_FAILURE_REASONS as unknown as string[], { message: `failure_reason: ${JOB_FAILURE_REASONS.join(', ')}` })
  failure_reason: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  failure_comment?: string;

  @ApiProperty({ required: false, description: 'Rasm havolasi' })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  photo?: string;

  @ApiProperty({ required: false, example: 100000, description: 'Olingan naqd (masalan chiqish haqi)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  cash_collected?: number;
}

export class ReviewDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ required: false, example: 'Tez va toza ishladi' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class WarrantyClaimDto {
  @ApiProperty({ example: 'Konditsioner suv tomizyapti' })
  @IsString()
  @IsNotEmpty({ message: 'comment majburiy' })
  @MaxLength(2000)
  comment: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  photos?: string[];
}

export class HideReviewDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  is_hidden: boolean;
}

export class WorkerMeDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  is_online: boolean;
}

