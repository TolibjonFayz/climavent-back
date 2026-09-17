import { PartialType } from '@nestjs/swagger';
import { CreateBannerDto } from './create-banner.dto';

/**
 * Qismiy yangilash.
 *
 * Ilgari bu sinf `PartialType` dan meros olib, SO'NG hamma maydonni
 * `@IsNotEmpty()` bilan qayta e'lon qilardi — natijada "qismiy" nomiga
 * qaramay har bir maydon MAJBURIY edi. Ya'ni bannerni vaqtincha o'chirib
 * qo'yish uchun ham butun banner qaytadan yuborilishi kerak bo'lardi
 * (topshiriq №19, 5-band).
 */
export class UpdateBannerDto extends PartialType(CreateBannerDto) {}
