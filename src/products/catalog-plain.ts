import type { ModelStatic, Order, WhereOptions } from 'sequelize';
import { Product } from './model/product.model';
import { Characteristic } from 'src/characteristics/model/characteristic.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';
import { Category } from 'src/category/model/category.model';
import { Store } from 'src/stores/model/store.model';
import { ProductImages } from 'src/product_images/model/product_image.model';
import { Review } from 'src/reviews/model/review.model';
import { markPlainResponse } from 'src/common/pricing/sale-presentation.interceptor';

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
 *   - bog'lanish kalitlari `{ all: true }` tartibida, yo'q `belongsTo` — `null`.
 */

type Row = Record<string, any>;

const getterCache = new Map<ModelStatic<any>, [string, (this: any) => unknown][]>();

function gettersOf(model: ModelStatic<any>) {
  let list = getterCache.get(model);
  if (!list) {
    list = Object.entries(model.getAttributes())
      .filter(([, a]: [string, any]) => typeof a.get === 'function')
      .map(([key, a]: [string, any]) => [key, a.get]);
    getterCache.set(model, list);
  }
  return list;
}

/** Xom qatorni Sequelize'ning `get({ plain: true })` natijasiga aylantiradi. */
export function plainRow(model: ModelStatic<any>, row: Row): Row {
  const out: Row = {};
  const self = { getDataValue: (k: string) => row[k], dataValues: row };
  for (const [key, get] of gettersOf(model)) {
    if (key in row) out[key] = get.call(self);
  }
  for (const key of Object.keys(row)) {
    if (!(key in out)) out[key] = row[key];
  }
  return out;
}

function groupBy(rows: Row[], key: string): Map<unknown, Row[]> {
  const map = new Map<unknown, Row[]>();
  for (const r of rows) {
    const k = r[key];
    let arr = map.get(k);
    if (!arr) map.set(k, (arr = []));
    arr.push(r);
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
    ...(q.light ? { attributes: { exclude: LIST_EXCLUDED_PRODUCT_ATTRS } } : {}),
    raw: true,
  })) as unknown as Row[];
  if (!products.length) return [];

  const ids = products.map((p) => p.id);
  const byId = { order: [['id', 'ASC']] as Order, raw: true };

  const [chars, categories, stores, images, reviews] = (await Promise.all([
    Characteristic.findAll({
      where: { product_id: ids },
      ...(q.light ? { attributes: ['id', 'product_id', ...PRICE_ATTRS] } : {}),
      ...byId,
    }),
    Category.findAll({ where: { id: uniq(products.map((p) => p.category_id)) }, ...byId }),
    Store.findAll({ where: { id: uniq(products.map((p) => p.store_id)) }, ...byId }),
    ProductImages.findAll({ where: { product_id: ids }, ...byId }),
    q.light ? Promise.resolve([]) : Review.findAll({ where: { product_id: ids }, ...byId }),
  ])) as unknown as Row[][];

  const insides = chars.length
    ? ((await ProductModelInside.findAll({
        where: { product_model_id: chars.map((c) => c.id) },
        ...(q.light ? { attributes: ['id', 'product_model_id', ...PRICE_ATTRS] } : {}),
        ...byId,
      })) as unknown as Row[])
    : [];

  const insidesByChar = groupBy(insides, 'product_model_id');
  const charsByProduct = groupBy(chars, 'product_id');
  const imagesByProduct = groupBy(images, 'product_id');
  const reviewsByProduct = groupBy(reviews, 'product_id');
  const categoryById = new Map(categories.map((c) => [c.id, plainRow(Category, c)]));
  const storeById = new Map(stores.map((s) => [s.id, plainRow(Store, s)]));

  const result = products.map((p) => {
    const out = plainRow(Product, p);
    out.characters = (charsByProduct.get(p.id) || []).map((c) => {
      const co = plainRow(Characteristic, c);
      co.insides = (insidesByChar.get(c.id) || []).map((i) => plainRow(ProductModelInside, i));
      return co;
    });
    // Bir xil kategoriya/do'kon bir necha mahsulotda — har biriga o'z nusxasi
    // (interceptor obyektlarni joyida o'zgartiradi).
    const cat = categoryById.get(p.category_id);
    out.category = cat ? { ...cat } : null;
    const store = storeById.get(p.store_id);
    out.store = store ? { ...store } : null;
    out.images = (imagesByProduct.get(p.id) || []).map((r) => plainRow(ProductImages, r));
    out.reviews = (reviewsByProduct.get(p.id) || []).map((r) => plainRow(Review, r));
    return out;
  });
  // Har obyekt shu so'rov uchun yangi — narx interceptori nusxasiz ishlaydi
  return markPlainResponse(result);
}
