import { literal, type ModelStatic, type Order, type WhereOptions } from 'sequelize';
import { Product } from './model/product.model';
import { Characteristic } from 'src/characteristics/model/characteristic.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';
import { Category } from 'src/category/model/category.model';
import { Store } from 'src/stores/model/store.model';
import { ProductImages } from 'src/product_images/model/product_image.model';
import { Review } from 'src/reviews/model/review.model';
import { markPlainResponse } from 'src/common/pricing/sale-presentation.interceptor';
import { SENSITIVE_RESPONSE_FIELDS, scrubSensitiveFields } from 'src/common/serialization/sensitive-fields';

/**
 * KATALOGNI TEZ YIG'ISH (topshiriq №51) — `products/all` ning to'liq ko'rinishi.
 *
 * NEGA: 500 ta mahsulotda ~9 400 ta variant bor. Sequelize har qatorga model
 * obyekti yasaydi (~10 000 ta), keyin javobda har birini `toJSON` qiladi —
 * so'rovlar millisekundlarda tugasa ham shu ikki bosqich ~1 s olardi.
 *
 * Bu yerda har jadval BITTA `raw` so'rov bilan o'qiladi (mahsulot soniga
 * bog'liq emas, N+1 yo'q) va obyektlar qo'lda yig'iladi. Javob AYNAN
 * `include` li Sequelize javobidek chiqadi:
 *   - modeldagi `get()` getterlari (DECIMAL -> number, bo'sh JSONB -> null)
 *     modelning o'zidan olinib qo'llanadi — model o'zgarsa bu ham ergashadi;
 *   - kalit tartibi `get({ plain: true })` dagidek: getterli maydonlar oldin;
 *   - bog'lanish kalitlari `{ all: true }` tartibida, yo'q `belongsTo` — `null`;
 *   - sana (`timestamptz`) Postgres'ning o'zida `toJSON()` bilan bir xil ISO
 *     satrga aylanadi (`2026-11-04T09:55:48.580Z`, millisekund kesiladi —
 *     JS `Date` ham kesadi). ~20 000 ta `Date` ni JS'da parse qilib, keyin
 *     `JSON.stringify` da qayta satrga aylantirish ~40 ms olardi.
 *
 * MAXFIY MAYDONLAR: javob Express'ning replacer'li `res.json` idan emas, tez
 * `JSON.stringify` dan o'tadi (`CatalogShapeInterceptor`). Shuning uchun
 * `SENSITIVE_RESPONSE_FIELDS` shu yerning o'zida tashlanadi: ustun bo'lsa —
 * obyektga umuman qo'shilmaydi, JSON(B) ustun ichida bo'lsa — har qanday
 * chuqurlikda o'chiriladi. Replacer bilan natija bir xil.
 */

type Row = Record<string, any>;
type Getter = (this: any) => unknown;

interface ModelInfo {
  getters: Map<string, Getter>;
  /** JSON/JSONB ustunlar — ichidan maxfiy kalitlar tozalanadi. */
  json: Set<string>;
  /** Getter'siz `timestamptz` ustunlar — SQL'da ISO satr qilib o'qiladi. */
  dates: Set<string>;
  /** Ustun nomi (`field`) — atribut nomidan farq qilishi mumkin. */
  field: Map<string, string>;
  all: string[];
}

const infoCache = new Map<ModelStatic<any>, ModelInfo>();

function infoOf(model: ModelStatic<any>): ModelInfo {
  let info = infoCache.get(model);
  if (!info) {
    info = { getters: new Map(), json: new Set(), dates: new Set(), field: new Map(), all: [] };
    for (const [key, a] of Object.entries(model.getAttributes()) as [string, any][]) {
      info.all.push(key);
      info.field.set(key, a.field || key);
      const type = a.type?.key;
      if (typeof a.get === 'function') info.getters.set(key, a.get);
      if (type === 'JSON' || type === 'JSONB') info.json.add(key);
      if (type === 'DATE' && typeof a.get !== 'function') info.dates.add(key);
    }
    infoCache.set(model, info);
  }
  return info;
}

/**
 * `findAll({ attributes })` uchun ro'yxat: sana ustunlari `to_char(...)` bilan.
 * `names` berilmasa — modelning hamma atributlari (Sequelize'ning odatiy
 * SELECT tartibida), `exclude` dagilarisiz.
 */
function selectAttrs(model: ModelStatic<any>, names?: string[], exclude: string[] = []) {
  const info = infoOf(model);
  return (names || info.all)
    .filter((k) => !exclude.includes(k))
    .map((k) =>
      info.dates.has(k)
        ? ([
            literal(
              `to_char(${model.sequelize!.getQueryInterface().quoteIdentifier(info.field.get(k)!)} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
            ),
            k,
          ] as [ReturnType<typeof literal>, string])
        : k,
    );
}

/** Getter ichidagi `this` — Sequelize instance'ining kerakli qismi. */
class RowSelf {
  constructor(public dataValues: Row) {}
  getDataValue(k: string) {
    return this.dataValues[k];
  }
}

type RowBuilder = (row: Row, getters: Getter[], self: RowSelf, scrub: (v: unknown) => unknown) => Row;

const builderCache = new Map<string, RowBuilder>();

/**
 * Bir so'rovning hamma qatorlari bir xil ustunlarga ega — shu ustunlar uchun
 * BIR MARTA obyekt-literal funksiyasi yasaladi (`{ "id": r["id"], ... }`).
 * Literal'dan chiqqan obyektlar bitta yashirin klassni bo'lishadi: kalitma-kalit
 * qo'shishdan sezilarli tez, xotira kamroq, keyingi `JSON.stringify` ham tezroq.
 * Kalitlar `JSON.stringify` bilan qochiriladi — ustun nomi kodga xom tushmaydi.
 */
function builderFor(model: ModelStatic<any>, sample: Row) {
  const info = infoOf(model);
  const rowKeys = Object.keys(sample).filter((k) => !SENSITIVE_RESPONSE_FIELDS.has(k));
  const getterKeys = info.all.filter((k) => info.getters.has(k) && rowKeys.includes(k));
  const sig = `${model.name}|${rowKeys.join(',')}`;
  let build = builderCache.get(sig);
  if (!build) {
    const value = (k: string, expr: string) => (info.json.has(k) ? `x(${expr})` : expr);
    const parts = [
      ...getterKeys.map((k, i) => `${JSON.stringify(k)}: ${value(k, `g[${i}].call(s)`)}`),
      ...rowKeys
        .filter((k) => !info.getters.has(k))
        .map((k) => `${JSON.stringify(k)}: ${value(k, `r[${JSON.stringify(k)}]`)}`),
    ];
    build = new Function('r', 'g', 's', 'x', `return {${parts.join(',')}};`) as RowBuilder;
    builderCache.set(sig, build);
  }
  const fns = getterKeys.map((k) => info.getters.get(k)!);
  const b = build;
  return (row: Row) => b(row, fns, new RowSelf(row), scrubSensitiveFields);
}

/** Xom qatorlarni Sequelize'ning `get({ plain: true })` natijasiga aylantiradi. */
export function plainRows(model: ModelStatic<any>, rows: Row[]): Row[] {
  if (!rows.length) return [];
  const build = builderFor(model, rows[0]);
  const out = new Array<Row>(rows.length);
  for (let i = 0; i < rows.length; i++) out[i] = build(rows[i]);
  return out;
}

/** `values[i]` ni `rows[i][key]` bo'yicha guruhlaydi (tartib saqlanadi). */
function groupBy(rows: Row[], values: Row[], key: string): Map<unknown, Row[]> {
  const map = new Map<unknown, Row[]>();
  for (let i = 0; i < rows.length; i++) {
    const k = rows[i][key];
    let arr = map.get(k);
    if (!arr) map.set(k, (arr = []));
    arr.push(values[i]);
  }
  return map;
}

const uniq = (values: unknown[]): number[] =>
  [...new Set(values.filter((v) => v !== null && v !== undefined))] as number[];

/** `view=list` uchun narx hisobiga yetarli maydonlar (interceptor shulardan min_* ni chiqaradi). */
const PRICE_ATTRS = ['price', 'currency', 'sale_price', 'sale_starts_at', 'sale_ends_at'];

/** `view=list` da mahsulotdan olib tashlanadigan og'ir maydonlar. */
export const LIST_EXCLUDED_PRODUCT_ATTRS = [
  'sizes',
  'sizesJson',
  'opisaniya',
  'opisaniyaJson',
  'naznacheniya',
  'naznacheniyaJson',
  'markirovka',
  'markirovkaJson',
];

export interface CatalogQuery {
  where: WhereOptions;
  order: Order;
  limit: number;
  offset: number;
  /** `list` — variantlar faqat narx maydonlari bilan, sharhlarsiz (keyin javobdan olib tashlanadi). */
  light?: boolean;
}

export async function loadCatalogPlain(q: CatalogQuery): Promise<Row[]> {
  const products = (await Product.findAll({
    where: q.where,
    order: q.order,
    limit: q.limit,
    offset: q.offset,
    attributes: selectAttrs(Product, undefined, q.light ? LIST_EXCLUDED_PRODUCT_ATTRS : []),
    raw: true,
  })) as unknown as Row[];
  if (!products.length) return [];

  const ids = products.map((p) => p.id);
  const byId = { order: [['id', 'ASC']] as Order, raw: true };

  const [chars, categories, stores, images, reviews] = (await Promise.all([
    Characteristic.findAll({
      where: { product_id: ids },
      attributes: selectAttrs(Characteristic, q.light ? ['id', 'product_id', ...PRICE_ATTRS] : undefined),
      ...byId,
    }),
    Category.findAll({
      where: { id: uniq(products.map((p) => p.category_id)) },
      attributes: selectAttrs(Category),
      ...byId,
    }),
    Store.findAll({
      where: { id: uniq(products.map((p) => p.store_id)) },
      attributes: selectAttrs(Store),
      ...byId,
    }),
    ProductImages.findAll({ where: { product_id: ids }, attributes: selectAttrs(ProductImages), ...byId }),
    q.light
      ? Promise.resolve([])
      : Review.findAll({ where: { product_id: ids }, attributes: selectAttrs(Review), ...byId }),
  ])) as unknown as Row[][];

  const insides = chars.length
    ? ((await ProductModelInside.findAll({
        where: { product_model_id: chars.map((c) => c.id) },
        attributes: selectAttrs(ProductModelInside, q.light ? ['id', 'product_model_id', ...PRICE_ATTRS] : undefined),
        ...byId,
      })) as unknown as Row[])
    : [];

  // Guruhlash XOM qatorlar bo'yicha (FK ustuni getter'dan o'tmagan holda),
  // natija esa tayyor obyekt — indeks bir xil.
  const plainInsides = plainRows(ProductModelInside, insides);
  const plainChars = plainRows(Characteristic, chars);
  const insidesByChar = groupBy(insides, plainInsides, 'product_model_id');
  for (let i = 0; i < chars.length; i++) plainChars[i].insides = insidesByChar.get(chars[i].id) || [];
  const charsByProduct = groupBy(chars, plainChars, 'product_id');
  const imagesByProduct = groupBy(images, plainRows(ProductImages, images), 'product_id');
  const reviewsByProduct = groupBy(reviews, plainRows(Review, reviews), 'product_id');
  const plainCategories = plainRows(Category, categories);
  const categoryById = new Map(categories.map((c, i) => [c.id, plainCategories[i]]));
  const plainStores = plainRows(Store, stores);
  const storeById = new Map(stores.map((s, i) => [s.id, plainStores[i]]));

  const plainProducts = plainRows(Product, products);
  const result = products.map((p, i) => {
    const out = plainProducts[i];
    out.characters = charsByProduct.get(p.id) || [];
    // Bir xil kategoriya/do'kon bir necha mahsulotda — har biriga o'z nusxasi
    // (interceptor obyektlarni joyida o'zgartiradi).
    const cat = categoryById.get(p.category_id);
    out.category = cat ? { ...cat } : null;
    const store = storeById.get(p.store_id);
    out.store = store ? { ...store } : null;
    out.images = imagesByProduct.get(p.id) || [];
    out.reviews = reviewsByProduct.get(p.id) || [];
    return out;
  });
  // Har obyekt shu so'rov uchun yangi va maxfiy kalitlarsiz — narx interceptori
  // nusxasiz ishlaydi, javob replacer'siz serializatsiya qilinadi.
  return markPlainResponse(result);
}
