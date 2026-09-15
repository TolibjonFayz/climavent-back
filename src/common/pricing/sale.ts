// Aksiya narxi — YAGONA qoida (topshiriq №15). Katalog javobi, saralash,
// `on_sale` filtri va buyurtma narxi hammasi shu fayldan hisoblaydi: kartada
// ko'ringan narx bilan buyurtmada yozilgan narx boshqa-boshqa chiqmasligi uchun.
//
// Narx qoidasi (sayt va `OrderPricingService` bilan bir xil):
//   modelda narxli SAP varianti bo'lsa — narx variantlardan;
//   bo'lmasa — modelning o'zidan.
// Hamma narxlar DOLLARDA.

export interface SaleSource {
  price?: unknown;
  sale_price?: unknown;
  sale_starts_at?: unknown;
  sale_ends_at?: unknown;
}

export interface CharacteristicSource extends SaleSource {
  insides?: SaleSource[] | null;
}

export interface ProductSource {
  characters?: CharacteristicSource[] | null;
}

const positive = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const time = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const t = new Date(v as string).getTime();
  return Number.isFinite(t) ? t : null;
};

/** Asosiy narx (USD). `null` — narx kiritilmagan. */
export const basePrice = (row: SaleSource): number | null => positive(row?.price);

/**
 * Aksiya hozir faolmi:
 *   sale_price bor, asosiy narxdan kichik, boshlanish o'tgan (yoki yo'q),
 *   tugash hali kelmagan (yoki yo'q).
 */
export function isSaleActive(row: SaleSource, now: number = Date.now()): boolean {
  const base = basePrice(row);
  const sale = positive(row?.sale_price);
  if (base === null || sale === null || sale >= base) return false;
  const starts = time(row?.sale_starts_at);
  const ends = time(row?.sale_ends_at);
  if (starts !== null && starts > now) return false;
  if (ends !== null && ends <= now) return false;
  return true;
}

/** Amaldagi narx: faol aksiya bo'lsa aksiya narxi, aks holda asosiy narx. */
export function effectivePrice(row: SaleSource, now: number = Date.now()): number | null {
  return isSaleActive(row, now) ? positive(row.sale_price) : basePrice(row);
}

export interface PricedOption<T> {
  row: T;
  base: number;
  effective: number;
  onSale: boolean;
}

/**
 * Model narxini beradigan qatorlar: narxli variantlar, ular bo'lmasa modelning o'zi.
 * Narxsiz model — bo'sh ro'yxat.
 */
export function pricedOptions(
  c: CharacteristicSource,
  now: number = Date.now(),
): PricedOption<SaleSource>[] {
  const fromInsides = (c?.insides || [])
    .map((row) => ({ row, base: basePrice(row) }))
    .filter((o): o is { row: SaleSource; base: number } => o.base !== null);
  const rows = fromInsides.length
    ? fromInsides
    : basePrice(c) !== null
      ? [{ row: c as SaleSource, base: basePrice(c) as number }]
      : [];
  return rows.map(({ row, base }) => {
    const onSale = isSaleActive(row, now);
    return { row, base, effective: onSale ? (positive(row.sale_price) as number) : base, onSale };
  });
}

/** Model (characteristic) bo'yicha: eng arzon asosiy va amaldagi narx. */
export function characteristicPricing(c: CharacteristicSource, now: number = Date.now()) {
  const options = pricedOptions(c, now);
  if (!options.length) return { base: null, effective: null, onSale: false };
  return {
    base: Math.min(...options.map((o) => o.base)),
    effective: Math.min(...options.map((o) => o.effective)),
    onSale: options.some((o) => o.onSale),
  };
}

export interface ProductPriceSummary {
  /** Kamida bitta variant (yoki variantsiz model) faol aksiyada */
  on_sale: boolean;
  /** Eng arzon ASOSIY narx (USD) */
  min_price: number | null;
  /** Eng arzon AMALDAGI narx (USD), aksiya yo'q bo'lsa `null` */
  min_sale_price: number | null;
}

/**
 * Mahsulot kartasi uchun. `on_sale` va chizilgan narx — IKKI XIL shart:
 * aksiya qimmat variantda bo'lsa `on_sale = true`, lekin `min_sale_price`
 * `min_price` ga teng (eng arzon narx o'zgarmagan).
 */
export function productPriceSummary(p: ProductSource, now: number = Date.now()): ProductPriceSummary {
  const perModel = (p?.characters || []).map((c) => characteristicPricing(c, now));
  const bases = perModel.map((m) => m.base).filter((v): v is number => v !== null);
  const effectives = perModel.map((m) => m.effective).filter((v): v is number => v !== null);
  const onSale = perModel.some((m) => m.onSale);
  return {
    on_sale: onSale,
    min_price: bases.length ? Math.min(...bases) : null,
    min_sale_price: onSale && effectives.length ? Math.min(...effectives) : null,
  };
}

/** Saralash uchun: amaldagi eng arzon narx, narxsiz mahsulot — oxirida. */
export function sortPrice(p: ProductSource, now: number = Date.now()): number {
  const s = productPriceSummary(p, now);
  return s.min_sale_price ?? s.min_price ?? Infinity;
}

/**
 * SQL: shu qatorning aksiyasi hozir faolmi. `alias` — jadval taxallusi.
 * `isSaleActive` bilan AYNAN bir xil shart (`on_sale` filtri uchun).
 */
export const ACTIVE_SALE_SQL = (alias: string) => `(
  ${alias}.sale_price IS NOT NULL
  AND ${alias}.price > 0
  AND ${alias}.sale_price < ${alias}.price
  AND (${alias}.sale_starts_at IS NULL OR ${alias}.sale_starts_at <= now())
  AND (${alias}.sale_ends_at IS NULL OR ${alias}.sale_ends_at > now())
)`;

/** SQL: faol aksiyadagi mahsulotlar id'lari (`products.id IN (...)` uchun). */
export const ON_SALE_PRODUCT_IDS_SQL = `(
  SELECT c.product_id FROM characteristics c
  WHERE EXISTS (
    SELECT 1 FROM "product-model-inside" i
    WHERE i.product_model_id = c.id AND ${ACTIVE_SALE_SQL('i')}
  )
  OR (
    ${ACTIVE_SALE_SQL('c')}
    AND NOT EXISTS (
      SELECT 1 FROM "product-model-inside" i2
      WHERE i2.product_model_id = c.id AND i2.price > 0
    )
  )
)`;
