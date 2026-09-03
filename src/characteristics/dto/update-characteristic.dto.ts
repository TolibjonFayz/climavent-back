import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateCharacteristicDto } from './create-characteristic.dto';
import { IsNumber, IsOptional, IsString } from 'class-validator';

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
}
