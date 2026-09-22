import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SignoutDto {
  /**
   * DIQQAT: dekoratorsiz maydon global `ValidationPipe` (`whitelist: true`)
   * tomonidan tanadan JIMGINA olib tashlanadi — ilgari `refresh_token`
   * shunday yo'qolib, `signout` hech qachon ishlamagan (topshiriq №29).
   */
  @ApiProperty({
    example: '54saf65d4f5as5f65s5f6safw4af465w',
    description: 'Refresh token (mobil sessiya yoki sayt JWT)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  refresh_token: string;
}
