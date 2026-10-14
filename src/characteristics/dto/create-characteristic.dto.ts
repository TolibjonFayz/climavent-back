import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
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
  IsBoolean,
} from 'class-validator';

/** Santimetr: son (yoki "133,5") butunga yaxlitlanadi; boshqasi tekshiruvga o'zgarishsiz (400). */
// `enableImplicitConversion` "60,6" ni NaN ga aylantirib qo'yadi — asl qiymat `obj[key]` dan
const roundCm = ({ value: converted, obj, key }: { value: any; obj: any; key: string }) => {
  const value = obj?.[key] ?? converted;
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return value;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : value;
};

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
  // №49: katalogda «133,5 sm» uchraydi — butun santimetrga yaxlitlanadi (400 emas)
  @Transform(roundCm)
  @IsInt()
  @Min(0)
  @Max(10000)
  length_cm?: number | null;

  @ApiProperty({ example: 80, required: false, nullable: true, description: 'Eni, sm' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  // №49: katalogda «133,5 sm» uchraydi — butun santimetrga yaxlitlanadi (400 emas)
  @Transform(roundCm)
  @IsInt()
  @Min(0)
  @Max(10000)
  width_cm?: number | null;

  @ApiProperty({ example: 60, required: false, nullable: true, description: 'Balandlik, sm' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  // №49: katalogda «133,5 sm» uchraydi — butun santimetrga yaxlitlanadi (400 emas)
  @Transform(roundCm)
  @IsInt()
  @Min(0)
  @Max(10000)
  height_cm?: number | null;

  // ---- №47, 1-bo'lim. `null` — standart (packages 1, needs_crane false, stackable true)
  @ApiProperty({ example: 2, required: false, nullable: true, description: 'Necha joy (split = 2)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(50)
  packages?: number | null;

  @ApiProperty({ example: false, required: false, nullable: true, description: 'Kran/manipulyator shart' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsBoolean()
  needs_crane?: boolean | null;

  @ApiProperty({ example: true, required: false, nullable: true, description: "Ustma-ust qo'yish mumkinmi" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsBoolean()
  stackable?: boolean | null;
}
