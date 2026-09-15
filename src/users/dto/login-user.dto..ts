import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginUserDto {
  @ApiProperty({ example: '+998900000000', description: 'Number of user' })
  @IsString()
  @IsNotEmpty()
  phone_number: string;

  @ApiProperty({
    example: true,
    required: false,
    description:
      "true — raqam YANGI bo'lsa va rozilik versiyalari yuborilmagan bo'lsa SMS yuborilmaydi, " +
      "javobda `consent_required: true` qaytadi (sayt rozilik belgisini ko'rsatadi)",
  })
  @IsOptional()
  @IsBoolean()
  check_consent?: boolean;

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
