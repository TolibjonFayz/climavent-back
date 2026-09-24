import { BadRequestException } from '@nestjs/common';
import type { Sequelize } from 'sequelize';
import { QueryTypes } from 'sequelize';

/**
 * NARX VALYUTASI — topshiriq №37.
 *
 * Valyuta MAHSULOT darajasida (`products.currency`): bitta mahsulotning
 * modellari, SAP variantlari va aksiya narxi shu valyutada saqlanadi — bazada
 * sotuvchi KIRITGAN qiymat turadi. `characteristics.currency` va
 * `"product-model-inside".currency` — mahsulotnikining NUSXASI, uni DB
 * trigger'lari yuritadi (migratsiya `20260924130000`): kod ularni hech qachon
 * yozmaydi, faqat o'qiydi. Nusxa shu uchun kerak: javobda narx qatori qaysi
 * chuqurlikda bo'lmasin (savat, sevimlilar, `characteristics/one`), qaysi
 * valyutada ekanini o'zi biladi.
 *
 * Kurs FAQAT `USD` narxlarga ta'sir qiladi; `UZS` narx kiritilganicha qoladi.
 */
export const CURRENCIES = ['USD', 'UZS'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const isCurrency = (v: unknown): v is Currency => v === 'USD' || v === 'UZS';

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** So'mda (butun son). USD da kurs yo'q bo'lsa — `null`. */
export function toUzs(value: unknown, currency: Currency, rate: number | null): number | null {
  const n = num(value);
  if (n === null) return null;
  if (currency === 'UZS') return Math.round(n);
  return rate ? Math.round(n * rate) : null;
}

/**
 * Dollarda (2 xona). UZS narxning DOLLAR EKVIVALENTI — eski mijozlar `price`
 * ni kursga ko'paytiradi, shuning uchun ularga so'm emas, shu qiymat beriladi.
 * Kurs yo'q bo'lsa UZS narx uchun `null` (so'mni "dollar" deb berib bo'lmaydi).
 */
export function toUsd(value: unknown, currency: Currency, rate: number | null): number | null {
  const n = num(value);
  if (n === null) return null;
  if (currency === 'USD') return n;
  return rate ? Math.round((n / rate) * 100) / 100 : null;
}

/** Narx maydonlari — `UZS` da butun son va kamida 1 000 (topshiriq №37). */
const PRICE_INPUT_FIELDS = ['price', 'sale_price'] as const;
export const UZS_MIN_PRICE = 1000;

/**
 * Yozishdan oldin: kiritilgan narxlar mahsulot valyutasiga mosmi.
 *   - `body.currency` yuborilgan bo'lsa va mahsulotnikidan farq qilsa — 400
 *     (masalan eski bot USD narxni so'mli mahsulotga yozmoqchi);
 *   - `UZS`: `price`/`sale_price` butun son va >= 1 000. 0 va `null` — "narx
 *     yo'q" (avvalgidek).
 * `USD` — o'zgarishsiz (DTO dagi qoida).
 */
export function assertPriceInput(body: Record<string, any>, currency: Currency) {
  if (body.currency !== undefined && body.currency !== null && body.currency !== currency) {
    throw new BadRequestException(
      `Mahsulot narxlari ${currency} da — narxni ${currency} da yuboring ` +
        `(valyutani mahsulotning o'zida almashtiring: PATCH /products/update/:id {currency})`,
    );
  }
  if (currency !== 'UZS') return;
  for (const f of PRICE_INPUT_FIELDS) {
    const v = body[f];
    if (v === undefined || v === null || Number(v) === 0) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < UZS_MIN_PRICE) {
      throw new BadRequestException(`${f}: so'mda butun son va kamida ${UZS_MIN_PRICE} bo'lsin`);
    }
  }
}

// ============================================================ kurs keshi
/**
 * Joriy kurs — javob interceptori HAR so'rovda kerak qiladi, shuning uchun
 * qisqa kesh. Kurs shu jarayonda o'zgarsa (`SettingsService`) darhol
 * yangilanadi; boshqa replika bo'lsa ko'pi bilan `TTL_MS` kechikadi.
 */
const TTL_MS = 10_000;
let cached: { rate: number | null; at: number } | null = null;
let inflight: Promise<number | null> | null = null;

export function setCachedRate(rate: number | null) {
  cached = { rate: rate && rate > 0 ? rate : null, at: Date.now() };
}

export async function currentUsdRate(sequelize: Sequelize): Promise<number | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rate;
  if (!inflight) {
    inflight = (async () => {
      try {
        const [row]: any[] = await sequelize.query(`SELECT value FROM settings WHERE key = 'usd_rate'`, {
          type: QueryTypes.SELECT,
        });
        const rate = Number(row?.value);
        setCachedRate(Number.isFinite(rate) && rate > 0 ? rate : null);
      } catch {
        // Baza vaqtincha javob bermasa eski qiymat qoladi
        if (!cached) setCachedRate(null);
      } finally {
        inflight = null;
      }
      return cached!.rate;
    })();
  }
  return inflight;
}
