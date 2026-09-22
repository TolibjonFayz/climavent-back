import { ApiProperty, PartialType } from '@nestjs/swagger';
import { RegisterUserDto } from './register-user.dto';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Profilni tahrirlash (`PATCH /api/users/update/:id`).
 *
 * DIQQAT (tuzatildi, №29 tekshiruvi): bu sinfning `fathername`, `birthdate`,
 * `sex`, `additional_phone_number`, `region`, `city`, `adress` maydonlarida
 * BIRORTA ham class-validator dekoratori yo'q edi. Global `ValidationPipe`
 * `whitelist: true` bilan ishlaydi — dekoratorsiz maydon tanadan JIMGINA
 * olib tashlanadi. Ya'ni foydalanuvchi tug'ilgan sanasini, manzilini,
 * shahrini saqlay OLMAGAN: API 200 qaytarardi, bazada esa hech narsa
 * o'zgarmasdi (`@ApiProperty` faqat Swagger uchun).
 */
export class UpdateUserDto extends PartialType(RegisterUserDto) {
  @ApiProperty({ example: "Adam o'g'li", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fathername?: string;

  /**
   * ISO sana. Sayt formasi to'ldirilmagan sanani BO'SH SATR bilan yuboradi,
   * shuning uchun `""` ham qabul qilinadi (servis uni `null` ga aylantiradi).
   */
  @ApiProperty({ example: '2005-09-04', required: false, nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.birthdate !== '' && o.birthdate !== null)
  @IsDateString()
  birthdate?: string | null;

  @ApiProperty({ example: 'Man', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sex?: string;

  @ApiProperty({ example: '+998908150513', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  additional_phone_number?: string;

  @ApiProperty({ example: 'Toshkent viloyati', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiProperty({ example: 'Toshkent', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiProperty({ example: 'Chilonzor 19-kvartal 16-uy', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  adress?: string;

  @ApiProperty({ example: 'myimg.jpg', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  image_url?: string;

  /** Push va e-pochta matni tili (topshiriq №29, 4-band). */
  @ApiProperty({ example: 'uz', required: false, enum: ['uz', 'ru', 'en'] })
  @IsOptional()
  @IsIn(['uz', 'ru', 'en'])
  lang?: string;
}
