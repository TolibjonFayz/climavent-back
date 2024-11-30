import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SignoutDto {
  @ApiProperty({
    example: '54saf65d4f5as5f65s5f6safw4af465w',
    description: 'Refresh token',
  })
  refresh_token: string;
}
