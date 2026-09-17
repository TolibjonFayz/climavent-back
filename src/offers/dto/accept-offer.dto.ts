import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { OFFER_KINDS } from '../model/offer-version.model';

export class AcceptOfferDto {
  @ApiProperty({ example: 'seller', enum: OFFER_KINDS })
  @IsString()
  @IsIn(OFFER_KINDS as unknown as string[])
  kind: string;

  // Versiya MAJBURIY: "qabul qildim" tugmasi bosilgan paytda ekranda AYNAN
  // qaysi versiya turganini dalilga yozamiz. Server o'zi qo'yib yuborsa,
  // foydalanuvchi ko'rmagan hujjat qabul qilingan bo'lib qolardi.
  @ApiProperty({ example: '1.0' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  version: string;
}
