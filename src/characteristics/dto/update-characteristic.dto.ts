import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateCharacteristicDto } from './create-characteristic.dto';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

// PATCH — hamma maydon IXTIYORIY. Ilgari bu yerda maydonlar
// `@IsOptional()` siz qayta e'lon qilingan edi, ya'ni PartialType bergan
// "ixtiyoriy" xossasi bekor bo'lardi.
//
// `content` / `contentJson` turi ATAYLAB `any`: `string` deb e'lon
// qilinsa, `enableImplicitConversion` obyektni String() bilan
// "[object Object]" ga aylantirib yuboradi (mazmun jimgina yo'qoladi).
export class UpdateCharacteristicDto extends PartialType(
  CreateCharacteristicDto,
) {
  @ApiProperty({ example: 'BO 45', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    example: 25000.5,
    description: "Narx (USD). O'nlik son qabul qilinadi.",
    required: false,
  })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiProperty({
    description:
      "Kontent: tayyor R2 havolasi bo'lsa shundayligicha saqlanadi, " +
      "aks holda (HTML satri yoki obyekt) R2'ga yuklanib havolasi saqlanadi.",
    example: '<p>Texnik jadval</p>',
    required: false,
  })
  @IsOptional()
  content?: any;

  @ApiProperty({
    description: "Kontentning JSON ko'rinishi. `content` bilan bir xil qoida.",
    example: { type: 'doc', content: [] },
    required: false,
  })
  @IsOptional()
  contentJson?: any;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsNumber()
  product_id?: number;

  // ---- Aksiya (topshiriq №15). Qoidalar: `common/pricing/sale-update.ts`.
  // Validatorlar `SaleFieldsDto` bilan bir xil — PartialType ichida mixin
  // ishlatib bo'lmagani uchun shu yerda takrorlangan.
  @ApiProperty({ example: 103.12, required: false, nullable: true, description: "Aksiya narxi (USD). null — aksiyani olib tashlash" })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "sale_price son bo'lsin (ko'pi bilan 2 xona)" })
  @IsPositive({ message: "sale_price 0 dan katta bo'lsin" })
  sale_price?: number | null;

  @ApiProperty({ example: '2026-09-16T00:00:00+05:00', required: false, nullable: true })
  @IsOptional()
  @IsDateString({}, { message: "sale_starts_at ISO sana bo'lsin" })
  sale_starts_at?: string | null;

  @ApiProperty({ example: '2026-09-30T23:59:59+05:00', required: false, nullable: true })
  @IsOptional()
  @IsDateString({}, { message: "sale_ends_at ISO sana bo'lsin" })
  sale_ends_at?: string | null;
}

