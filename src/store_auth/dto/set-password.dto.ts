import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

// Uzunlik (≥ 8) servisda tekshiriladi — topshiriq aniq kod talab qiladi:
// qisqa parol 400, yaroqsiz token 410. DTO faqat turini tekshiradi.
export class SetPasswordDto {
  @ApiProperty({ example: '9c1e…' })
  @IsString()
  @MaxLength(200)
  token: string;

  @ApiProperty({ example: '••••••••', minLength: 8 })
  @IsString()
  @MaxLength(200)
  password: string;
}
