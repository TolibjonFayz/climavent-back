import { BadRequestException } from '@nestjs/common';

// Query param sifatida kelgan page/limit'ni tekshiradi. Berilmagan bo'lsa
// undefined qaytadi (chaqiruvchi standart/ to'liq ro'yxat xatti-harakatini
// tanlaydi). Noto'g'ri qiymat (manfiy, butun son emas) bo'lsa 400 tashlaydi
// — avval bunday holatlarda yo jimgina e'tiborsiz qoldirilar, yoki 500 bilan
// yiqilardi.
export function parsePositiveIntParam(
  value: string | undefined,
  paramName: string,
): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestException(`"${paramName}" musbat butun son bo'lishi kerak`);
  }
  return n;
}
