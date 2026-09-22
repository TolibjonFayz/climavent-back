import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    description: 'The check number for verification.',
    example: '+998989909090',
  })
  @Matches(/^\+998\d{9}$/, { message: 'Invalid phone number format' })
  phone_number: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    description: 'The verification key for verification.',
    example: 'ABCDEFkjfoi34jtioje0ijqf09rjtg023rjef0iejrf0i2j394g20i3rejf',
  })
  verification_key: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    description: 'The OTP (One-Time Password) for verification.',
    example: '12345',
  })
  otp: string;
  @ApiProperty({
    description: 'UserId',
    example: '1',
  })
  userId: string;

  /**
   * `mobile` — so'rov Android/iOS ilovasidan (topshiriq №29, 3-band).
   * Shu holatda access token 15 daqiqa, refresh esa 90 kunlik SIRPANUVCHI
   * sessiya bo'ladi (`users/refresh` bilan yangilanadi). Berilmasa — sayt
   * oqimi o'zgarmaydi.
   */
  @ApiProperty({ example: 'mobile', required: false, enum: ['mobile', 'web'] })
  @IsOptional()
  @IsIn(['mobile', 'web'])
  client?: 'mobile' | 'web';

  // ---- Rozilik (topshiriq №18, 2-band). Ikkalasi birga beriladi; berilmasa
  // eskicha ishlaydi (sayt yangilanguncha buzilmasin).
  @ApiProperty({ example: '1.0', required: false, description: "Qabul qilingan foydalanish shartlari versiyasi" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  terms_version?: string;

  @ApiProperty({ example: '1.0', required: false, description: "Qabul qilingan maxfiylik siyosati versiyasi" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  privacy_version?: string;
}
