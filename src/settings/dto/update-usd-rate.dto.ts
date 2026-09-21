import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsPositive, Max } from 'class-validator';

export class UpdateUsdRateDto {
  @ApiProperty({
    example: 12000,
    description: "Dollar kursi — 1 USD necha so'm",
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  // Yuqori chegara — nol qo'shib yuborish kabi kiritish xatosidan himoya.
  // Kurs bir necha barobar oshsa ham bu chegaraga yetmaydi.
  @Max(1_000_000)
  rate: number;
}

/** Kursni har kuni avtomatik yangilash galochkasi (topshiriq №27). */
export class UpdateUsdRateAutoDto {
  @ApiProperty({
    example: true,
    description:
      "true — kunlik cron kursni Markaziy bankdan olib qo'yadi; false — kurs faqat qo'lda o'zgaradi",
  })
  @IsBoolean()
  enabled: boolean;
}
