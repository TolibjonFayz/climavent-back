import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

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

  @ApiProperty({ example: '25000', description: 'Price of the character' })
  @IsNumber()
  price: number;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;
}
