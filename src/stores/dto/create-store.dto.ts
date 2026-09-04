import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateStoreDto {
  @ApiProperty({ example: 'Jihozvent' })
  @IsString()
  @IsNotEmpty({ message: "name bo'sh bo'lmasligi kerak" })
  name: string;

  // Sayt URL manzilida ishlatiladi — keyin o'zgartirish og'riqli,
  // shuning uchun format qat'iy (bazada ham CHECK constraint bor).
  @ApiProperty({ example: 'jihozvent', description: "Kichik harf, a-z0-9-" })
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: "slug faqat kichik harf, raqam va defisdan iborat bo'lsin",
  })
  slug: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description_uz?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description_ru?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description_en?: string;

  @ApiProperty({ required: false, description: 'POST /images/upload-image dan olingan havola' })
  @IsOptional()
  @IsString()
  logo_url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telegram?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiProperty({ required: false, example: '#2563eb' })
  @IsOptional()
  @IsHexColor({ message: "color '#RRGGBB' ko'rinishida bo'lsin" })
  color?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;
}
