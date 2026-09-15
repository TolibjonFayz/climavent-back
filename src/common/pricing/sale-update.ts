import { BadRequestException } from '@nestjs/common';
import { SaleSource, basePrice } from './sale';

export interface SaleUpdateInput {
  price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
}

const toTime = (v: unknown): number | null =>
  v === null || v === undefined ? null : new Date(v as string).getTime();

/**
 * Aksiya maydonlari bo'yicha yangilanishni tekshiradi va bazaga yoziladigan
 * qismini qaytaradi. Aksiya maydonlari yuborilmagan bo'lsa — `{}` (masalan faqat
 * `price` o'zgartirilsa aksiya tekshirilmaydi: asosiy narx aksiyadan pastga
 * tushsa, aksiya o'z-o'zidan nofaol bo'ladi).
 */
export function resolveSaleUpdate(
  existing: SaleSource,
  dto: SaleUpdateInput,
  now: number = Date.now(),
): Record<string, unknown> {
  const touched =
    dto.sale_price !== undefined || dto.sale_starts_at !== undefined || dto.sale_ends_at !== undefined;
  if (!touched) return {};

  // Aksiyani olib tashlash — sanalar ham tozalanadi, eski sana keyingi aksiyaga
  // tasodifan ko'chib o'tmasin.
  if (dto.sale_price === null) {
    return { sale_price: null, sale_starts_at: null, sale_ends_at: null };
  }

  const sale = dto.sale_price !== undefined ? dto.sale_price : existing.sale_price;
  const price = basePrice({ price: dto.price !== undefined ? dto.price : existing.price });
  const starts = toTime(dto.sale_starts_at !== undefined ? dto.sale_starts_at : existing.sale_starts_at);
  const ends = toTime(dto.sale_ends_at !== undefined ? dto.sale_ends_at : existing.sale_ends_at);

  if (sale === null || sale === undefined) {
    throw new BadRequestException("Sana berish uchun avval sale_price kerak");
  }
  if (price === null) {
    throw new BadRequestException(
      "Asosiy narxi yo'q (price bo'sh yoki 0) qatorga aksiya qo'yib bo'lmaydi — avval price kiriting",
    );
  }
  if (!(Number(sale) < price)) {
    throw new BadRequestException(`sale_price asosiy narxdan (${price}) kichik bo'lishi kerak`);
  }
  if (starts !== null && ends !== null && ends <= starts) {
    throw new BadRequestException("sale_ends_at sale_starts_at dan keyin bo'lishi kerak");
  }
  if (ends !== null && ends <= now) {
    throw new BadRequestException("sale_ends_at o'tib ketgan sana — aksiya boshlanmasdanoq tugagan bo'ladi");
  }

  const patch: Record<string, unknown> = {};
  if (dto.sale_price !== undefined) patch.sale_price = dto.sale_price;
  if (dto.sale_starts_at !== undefined) patch.sale_starts_at = dto.sale_starts_at === null ? null : new Date(dto.sale_starts_at);
  if (dto.sale_ends_at !== undefined) patch.sale_ends_at = dto.sale_ends_at === null ? null : new Date(dto.sale_ends_at);
  return patch;
}
