import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class StoreLoginDto {
  @ApiProperty({ example: 'jihozvent_admin' })
  @IsString()
  @IsNotEmpty()
  login: string;

  @ApiProperty({ example: 'kuchli-parol-123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
