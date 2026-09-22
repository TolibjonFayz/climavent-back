import { PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto';

/**
 * QISMIY yangilash (PATCH): har maydon ixtiyoriy.
 *
 * Ilgari bu sinf `PartialType(CreateCategoryDto)` dan meros olsa ham,
 * uchta nom maydonini `@IsString() @IsNotEmpty()` bilan QAYTA e'lon qilardi.
 * class-validator meros qoidalarini ALMASHTIRMAYDI, ustiga QO'SHADI —
 * shuning uchun `PartialType` bergan ixtiyoriylik bekor bo'lib, faqat
 * `category_id` ni o'zgartirish uchun ham uchta nomni qayta yuborish
 * shart edi (topshiriq №29, 5-band).
 */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
