import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** `POST /api/users/refresh` (topshiriq №29, 3-band). */
export class RefreshTokenDto {
  @ApiProperty({
    example: 'q7k2...base64url',
    description:
      "verify-otp (yoki oldingi refresh) qaytargan refresh token. " +
      "Sayt JWT refresh tokeni ham qabul qilinadi.",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  refresh_token: string;
}
