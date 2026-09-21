import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** KP qatori: qaysi buyurtma qatoriga qancha narx. */
export class QuoteItemDto {
  @ApiProperty({ example: 125 })
  @IsInt()
  order_item_id: number;

  @ApiProperty({ example: 36100228, description: "Bir donaning narxi, so'mda" })
  @IsInt({ message: "price butun son bo'lsin (so'm)" })
  @Min(0)
  // Yuqori chegara — nol qo'shib yuborish kabi kiritish xatosidan himoya
  // (buyurtma summasi BIGINT, lekin bitta qator 100 mlrd bo'lmaydi).
  @Max(100_000_000_000)
  price: number;
}

/** `PUT /orders/:id/quote` — sotuvchi narx taklifini yuboradi (topshiriq №25, 2-band). */
export class SendQuoteDto {
  @ApiProperty({ type: [QuoteItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items: QuoteItemDto[];

  @ApiProperty({ example: '2026-09-27', required: false, description: 'Standart: bugun + 10 kun' })
  @IsOptional()
  @IsDateString()
  valid_until?: string;

  @ApiProperty({ required: false, example: "2 hafta, Toshkent bo'ylab bepul" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  delivery_terms?: string;

  @ApiProperty({ required: false, example: "50% oldindan, bank o'tkazmasi" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  payment_terms?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/** `POST /orders/:id/quote/accept` — mijoz qabul qiladi. */
export class AcceptQuoteDto {
  @ApiProperty({ example: 2, description: 'Oxirgi versiya bo\'lishi shart' })
  @IsInt()
  @Min(1)
  version: number;

  @ApiProperty({ required: false, example: '"AIRCOOL" MChJ' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  company_name?: string;

  @ApiProperty({ required: false, example: '301234567' })
  @IsOptional()
  @Matches(/^\d{9}$/, { message: "company_tin 9 raqamdan iborat bo'lsin" })
  company_tin?: string;
}

/** `POST /orders/:id/quote/reject` — mijoz rad etadi. */
export class RejectQuoteDto {
  @ApiProperty({ required: false, example: 'Qimmat' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
