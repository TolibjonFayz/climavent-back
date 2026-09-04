import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateStoreUserDto {
  @ApiProperty({ example: 'jihozvent_admin' })
  @IsString()
  @IsNotEmpty()
  login: string;

  // Ochiq parol faqat SHU YERDA qabul qilinadi, darhol bcrypt bilan
  // hash qilinadi va hech qachon qaytarilmaydi.
  @ApiProperty({ example: 'kuchli-parol-123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: "parol kamida 8 belgi bo'lsin" })
  password: string;

  @ApiProperty({
    example: 2,
    required: false,
    description: "store_admin uchun MAJBURIY, superadmin uchun bo'sh",
  })
  @IsOptional()
  @IsInt()
  store_id?: number;

  @ApiProperty({ example: 'Anvar Karimov', required: false })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiProperty({ example: 'store_admin', enum: ['superadmin', 'store_admin'] })
  @IsOptional()
  @IsIn(['superadmin', 'store_admin'], {
    message: "role faqat 'superadmin' yoki 'store_admin' bo'lishi mumkin",
  })
  role?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
