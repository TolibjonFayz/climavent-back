import { ApiProperty } from '@nestjs/swagger';
import {
  ORDER_KINDS,
  ORDER_STATUSES,
  ORDER_STATUS_MESSAGE,
} from '../order-status';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';

/**
 * Buyurtma qatori — `POST /orders/create` ichida (topshiriq №28).
 *
 * Nega kerak: savatdan KP olishda sayt buyurtmani va qatorlarni BITTA
 * so'rovda yuborishi, javobda esa tayyor KP ni olishi kerak. Ilgari
 * qatorlar alohida `order-items/create` bilan qo'shilardi va KP ni qachon
 * yaratishni server bilmasdi.
 *
 * Narx bu yerda YO'Q — uni server aniqlaydi (`OrderPricingService`).
 */
export class OrderLineDto {
  @ApiProperty({ example: 225 })
  @IsInt()
  product_id: number;

  @ApiProperty({ example: 'ВНВ243.1-078', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  product_model?: string;

  @ApiProperty({ example: 305, required: false, description: 'Model (characteristic) id' })
  @IsOptional()
  @IsInt()
  product_model_id?: number;

  @ApiProperty({ example: 981, required: false, description: 'SAP varianti id' })
  @IsOptional()
  @IsInt()
  product_model_inside_id?: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({ example: 1, description: 'User id' })
  @IsNumber()
  @IsNotEmpty()
  user_id: number;

  // E'TIBORGA OLINMAYDI (topshiriq №13, 4-band): summa qatorlar
  // yig'indisidan serverda hisoblanadi. Eski mijozlar buzilmasligi uchun
  // qabul qilinadi.
  @ApiProperty({
    example: 549000,
    required: false,
    deprecated: true,
    description: "E'tiborga olinmaydi — summani server hisoblaydi",
  })
  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  // Qat'iy ro'yxat (topshiriq №14, 4-band). Eski o'zbekcha nomlar
  // ("Tolanmagan", "Yetkazilyapti", "Done") hozircha servis qatlamida
  // qabul qilinib, yangisiga aylantiriladi — shuning uchun bu yerda
  // `@IsIn` ro'yxatiga ular ham kiritilgan.
  @ApiProperty({
    example: 'new',
    description: ORDER_STATUS_MESSAGE,
    enum: ORDER_STATUSES,
  })
  @IsString()
  @IsNotEmpty()
  @IsIn([...ORDER_STATUSES, 'Tolanmagan', 'Yetkazilyapti', 'Done'], {
    message: ORDER_STATUS_MESSAGE,
  })
  status: string;

  @ApiProperty({ example: 'Location', description: 'Location of order' })
  @IsString()
  @IsNotEmpty()
  location: string;

  // ——— KP so'rovi (topshiriq №21, 3-band) ———

  @ApiProperty({ example: 'quote', enum: ORDER_KINDS, required: false, description: "Standart 'order'" })
  @IsOptional()
  @IsIn(ORDER_KINDS as unknown as string[], { message: `kind: ${ORDER_KINDS.join(', ')}` })
  kind?: string;

  /**
   * Topshiriq №28. `site_kp` + `kind: quote` bo'lsa server KP ning
   * **v1 versiyasini darhol** yaratadi va javobda qaytaradi — mijoz
   * sotuvchini kutmaydi.
   */
  @ApiProperty({
    example: 'site_kp',
    enum: ['site_kp', 'manual'],
    required: false,
    description: "site_kp — mijoz savatdan KP oldi (v1 darhol yaratiladi)",
  })
  @IsOptional()
  @IsIn(['site_kp', 'manual'], { message: 'source: site_kp yoki manual' })
  source?: string;

  @ApiProperty({
    type: [OrderLineDto],
    required: false,
    description: "Qatorlar — berilsa shu yerda yaratiladi (narxni server aniqlaydi)",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items?: OrderLineDto[];

  @ApiProperty({ example: 'Montaj bilan, Toshkentga yetkazish', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiProperty({ example: '"AIRCOOL" MChJ', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  company_name?: string;

  @ApiProperty({ example: '301234567', required: false, description: 'STIR, 9 raqam' })
  @IsOptional()
  @Matches(/^\d{9}$/, { message: "company_tin 9 raqamdan iborat bo'lsin" })
  company_tin?: string;

  // ——— Yetkazish uchun (topshiriq №22, 2-band). Eski buyurtmalarda null ———

  @ApiProperty({ example: 'Aziz Karimov', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  recipient_name?: string;

  @ApiProperty({ example: '+998901234567', required: false })
  @IsOptional()
  @Matches(/^\+998\d{9}$/, { message: "recipient_phone +998XXXXXXXXX ko'rinishida bo'lsin" })
  recipient_phone?: string;

  @ApiProperty({ example: "2-kirish, 5-qavat, 18-xonadon, mo'ljal: maktab", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address_details?: string;

  @ApiProperty({ example: 41.311081, required: false })
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiProperty({ example: 69.240562, required: false })
  @IsOptional()
  @IsLongitude()
  lng?: number;
}
