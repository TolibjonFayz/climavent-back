import { ApiProperty } from '@nestjs/swagger';
import {
  ORDER_KINDS,
  ORDER_STATUSES,
  ORDER_STATUS_MESSAGE,
} from '../order-status';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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
}
