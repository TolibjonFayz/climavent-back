import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CreateStoreUserDto } from './create-store-user.dto';

// Parol shu yerda ham almashtiriladi — berilsa qayta hash qilinadi.
export class UpdateStoreUserDto extends PartialType(CreateStoreUserDto) {
  /**
   * Bildirishnoma tili (topshiriq №31). Hamkor ilovasi kirgandan keyin
   * bir marta yuborsa yetadi; bo'sh bo'lsa matn o'zbekcha ketadi.
   */
  @ApiProperty({ example: 'uz', required: false, enum: ['uz', 'ru', 'en'] })
  @IsOptional()
  @IsIn(['uz', 'ru', 'en'])
  lang?: string;
}
