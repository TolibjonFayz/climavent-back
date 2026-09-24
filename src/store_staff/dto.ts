import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

// DIQQAT: `whitelist: true` — validatorsiz maydon jimgina o'chadi.
// Superadmin uchun `store_id` — ixtiyoriy (adminka hozir ishlatmaydi).

export class CreateStoreRoleDto {
  @ApiProperty({ example: 'Sotuv menejeri' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @ApiProperty({ example: ['orders.view', 'orders.edit', 'chat.reply'] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  permissions: string[];

  @ApiProperty({ required: false, description: 'Faqat superadmin' })
  @IsOptional()
  @IsInt()
  @Min(1)
  store_id?: number;
}

export class UpdateStoreRoleDto {
  @ApiProperty({ required: false, example: 'Katta sotuv menejeri' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ApiProperty({ required: false, example: ['orders.view'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  permissions?: string[];
}

const LOGIN_RE = /^[a-zA-Z0-9._-]{3,50}$/;
const PHONE_RE = /^\+998\d{9}$/;

export class CreateStaffDto {
  @ApiProperty({ example: 'aziz' })
  @Matches(LOGIN_RE, { message: 'login: 3–50 belgi, faqat lotin harf, raqam, . _ -' })
  login: string;

  @ApiProperty({ example: 'kamida8belgi' })
  @IsString()
  @MinLength(8, { message: "Parol kamida 8 belgi bo'lsin" })
  @MaxLength(200)
  password: string;

  @ApiProperty({ example: 'Aziz Karimov' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  full_name: string;

  @ApiProperty({ required: false, nullable: true, example: '+998901234567' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(PHONE_RE, { message: "phone +998XXXXXXXXX ko'rinishida bo'lsin" })
  phone?: string | null;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  role_id: number;

  @ApiProperty({ required: false, description: 'Faqat superadmin' })
  @IsOptional()
  @IsInt()
  @Min(1)
  store_id?: number;
}

export class UpdateStaffDto {
  @ApiProperty({ required: false, example: 'Aziz Karimov' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  full_name?: string;

  @ApiProperty({ required: false, nullable: true, example: '+998901234567' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(PHONE_RE, { message: "phone +998XXXXXXXXX ko'rinishida bo'lsin" })
  phone?: string | null;

  @ApiProperty({ required: false, example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  role_id?: number;

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: "Parol kamida 8 belgi bo'lsin" })
  @MaxLength(200)
  password?: string;
}
