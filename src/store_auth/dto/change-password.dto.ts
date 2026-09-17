import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

// Uzunlik (≥ 8) va "joriysi bilan bir xil emas" — servisda (aniq 400 xabari bilan).
export class ChangePasswordDto {
  @ApiProperty({ example: '••••••••' })
  @IsString()
  @MaxLength(200)
  current_password: string;

  @ApiProperty({ example: '••••••••', minLength: 8 })
  @IsString()
  @MaxLength(200)
  new_password: string;
}
