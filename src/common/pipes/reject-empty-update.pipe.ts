import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

// O'zgartirish (Update*Dto) so'rovida bitta ham maydon kelmasa — 400.
//
// Nima uchun: tana bo'sh bo'lsa (yoki hamma maydon `whitelist` da tushib
// qolsa) Sequelize `Model.update({}, …)` hech narsa qilmay `[0]` qaytaradi.
// Servislar esa `updated[1][0]` ni o'qiydi (14 ta servis, 21 joy) va
// TypeError -> 500 chiqardi. Har birini alohida tuzatish o'rniga shu yerda
// ushlanadi: mijoz nima noto'g'ri ekanini ko'radi.
//
// Bo'sh tana MA'NOLI bo'lgan DTO (masalan izohni tozalash) klassiga
// `static allowEmpty = true` qo'yiladi.
//
// Global ValidationPipe'dan KEYIN ulanadi (main.ts) — qiymat allaqachon
// DTO'ga aylangan va ortiqcha maydonlardan tozalangan bo'ladi.
@Injectable()
export class RejectEmptyUpdatePipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    const dto = metadata.metatype as any;
    if (metadata.type !== 'body' || !dto?.name || !/^Update/.test(dto.name) || dto.allowEmpty) {
      return value;
    }
    const hasField =
      value && typeof value === 'object' && Object.values(value).some((v) => v !== undefined);
    if (!hasField) {
      throw new BadRequestException("O'zgartirish uchun hech qanday maydon yuborilmadi");
    }
    return value;
  }
}
