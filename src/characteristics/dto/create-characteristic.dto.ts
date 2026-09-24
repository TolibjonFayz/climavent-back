import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateCharacteristicDto {
  @ApiProperty({
    example: 'BO 45',
    description: 'Title of the characteristic',
    required: false,
  })
  @IsOptional()
  @IsString()
  title?: string;

  // DIQQAT: tur `any` — ATAYLAB. `string` deb e'lon qilinsa, global
  // ValidationPipe'dagi `enableImplicitConversion` obyektni String() bilan
  // aylantirib "[object Object]" qilib yuboradi va mazmun jimgina
  // yo'qoladi. Obyekt ham, satr ham, tayyor R2 havolasi ham qabul
  // qilinadi — qaysi biri ekanini servis o'zi aniqlaydi.
  @ApiProperty({
    description:
      "Kontent. Uch xil bo'lishi mumkin: (1) tayyor R2 havolasi — " +
      "shundayligicha saqlanadi; (2) HTML satri; (3) obyekt — " +
      "ikkalasi ham R2'ga yuklanib, havolasi saqlanadi.",
    example: '<p>Texnik jadval</p>',
  })
  @IsNotEmpty()
  content: any;

  @ApiProperty({
    description:
      "Kontentning JSON (ProseMirror) ko'rinishi. `content` bilan bir xil " +
      "qoida: havola bo'lsa shundayligicha, aks holda R2'ga yuklanadi.",
    example: { type: 'doc', content: [] },
  })
  @IsNotEmpty()
  contentJson: any;

  @ApiProperty({ example: '25000', description: "Narx — mahsulot valyutasida (USD yoki UZS; UZS da butun son >= 1000)" })
  @IsNumber()
  price: number;

  // Topshiriq №37: narx MAHSULOT valyutasida. `currency` ixtiyoriy — faqat
  // tekshiruv uchun: mahsulotnikidan farq qilsa 400 (valyuta shu yerda
  // o'zgarmaydi — `PATCH /products/update/:id {currency}`).
  @ApiProperty({ example: 'UZS', enum: ['USD', 'UZS'], required: false, description: "Tekshiruv: narx qaysi valyutada yuborilgan" })
  @IsOptional()
  @IsIn(['USD', 'UZS'], { message: "currency USD yoki UZS bo'lsin" })
  currency?: 'USD' | 'UZS';

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;

  // ---- Og'irlik va o'lcham (topshiriq №26, 7-band) ----
  @ApiProperty({ example: 42.5, required: false, nullable: true, description: "Og'irlik, kg" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  @Max(100000)
  weight_kg?: number | null;

  @ApiProperty({ example: 120, required: false, nullable: true, description: 'Uzunlik, sm' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(10000)
  length_cm?: number | null;

  @ApiProperty({ example: 80, required: false, nullable: true, description: 'Eni, sm' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(10000)
  width_cm?: number | null;

  @ApiProperty({ example: 60, required: false, nullable: true, description: 'Balandlik, sm' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(10000)
  height_cm?: number | null;
}
