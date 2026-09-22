import Sequelize from 'sequelize';
import type { Viewer } from '../middleware/viewer_scope.middleware';

const { Op } = Sequelize;

/**
 * KATALOG KO'RINUVCHANLIGI — YAGONA MANBA (topshiriq №29, 1-band).
 *
 * Ilgari ko'rinuvchanlik BITTA `privileged: boolean` bayrog'i bilan hal
 * qilinardi va u "guvohnomasi bor" degan ma'noni bildirardi. Natijada:
 *
 *   1. SAYT ADMINI (`users.is_admin`) tokeni bilan kelgan so'rov hammasini
 *      ko'rardi. Prod'da bunday hisob ikkita bor (id 8, 16) va ular ayni
 *      paytda oddiy XARIDOR ham — mobil ilovaga o'sha raqam bilan kiradi.
 *      Ilova kirgandan keyin e'lon qilinmagan do'konlarning (Armavent,
 *      VENTS US — 40 ta mahsulot) tovarini bosh sahifada ko'rsatib qo'ygan
 *      sabab shu.
 *   2. HAR QANDAY do'kon admini BOShQA do'konning yashirin tovarini ham
 *      ko'rardi (Jihozvent admini Armavent narxlarini).
 *
 * Endi qoida quyidagicha:
 *
 *   servis kaliti, superadmin  -> hammasi;
 *   do'kon admini              -> O'Z do'konining hammasi + boshqalarning
 *                                 faqat ommaviy (faol do'kon + faol tovar);
 *   xaridor, sayt admini, mehmon -> faqat ommaviy.
 *
 * Ya'ni `users` jadvalidagi HECH QANDAY token katalogni kengaytirmaydi.
 * Adminka ishi uchun do'kon hisobi (store-auth) yoki servis kaliti kerak.
 *
 * ISTISNO (`siteAdminSeesAll`): faqat ATAYLAB adminka uchun mo'ljallangan
 * ikki joy — `products/alladmin` ro'yxati va `products/one/:id` tahrir
 * shakli. Eski Vue adminka sayt admini tokeni bilan ishlaydi (store-auth
 * qo'shilmagan) va u ko'chirilmaguncha nofaol do'kon tovarini tahrirlash
 * imkoni saqlanadi. Ro'yxat/qidiruv endpointlarida bu istisno YO'Q.
 */
export type CatalogScope =
  /** Cheklovsiz: servis kaliti, superadmin (va istisno holatda sayt admini). */
  | { kind: 'all' }
  /** O'z do'koni to'liq, qolganlari ommaviy holatda. */
  | { kind: 'store'; storeId: number }
  /** Mehmon bilan bir xil. */
  | { kind: 'public' };

export const PUBLIC_SCOPE: CatalogScope = { kind: 'public' };

export function catalogScope(
  viewer?: Viewer | null,
  opts: { siteAdminSeesAll?: boolean } = {},
): CatalogScope {
  const kind = viewer?.kind ?? null;
  if (kind === 'service' || kind === 'superadmin') return { kind: 'all' };
  if (kind === 'site_admin' && opts.siteAdminSeesAll) return { kind: 'all' };
  if (kind === 'store_admin' && viewer?.store_id) {
    return { kind: 'store', storeId: viewer.store_id };
  }
  return PUBLIC_SCOPE;
}

/** Faol do'konlar ichida faol mahsulot — mehmon ko'radigan shart. */
function publicProductWhere(): Record<string, any> {
  return {
    is_active: true,
    store_id: {
      [Op.in]: Sequelize.literal('(SELECT id FROM stores WHERE is_active = true)'),
    },
  };
}

/**
 * `products` uchun `where` bo'lagi. Natija boshqa shartlar bilan `...spread`
 * qilinadi, shuning uchun kalitlar to'qnashmasligi muhim: do'kon holatida
 * hamma narsa bitta `Op.or` ichida qaytadi.
 */
export function productVisibilityWhere(scope: CatalogScope): Record<string, any> {
  if (scope.kind === 'all') return {};
  if (scope.kind === 'store') {
    return { [Op.or]: [{ store_id: scope.storeId }, publicProductWhere()] } as Record<string, any>;
  }
  return publicProductWhere();
}

/** Mahsulot ko'rinadimi (bitta yozuv uchun, SQL siz). */
export function productVisible(
  product: { is_active?: boolean; store_id?: number; store?: { is_active?: boolean } | null },
  scope: CatalogScope,
  activeStoreIds?: Set<number>,
): boolean {
  if (scope.kind === 'all') return true;
  if (scope.kind === 'store' && product.store_id === scope.storeId) return true;
  if (!product.is_active) return false;
  if (activeStoreIds) return activeStoreIds.has(Number(product.store_id));
  return product.store?.is_active !== false;
}

/**
 * Ko'rinadigan mahsulot id'lari — SQL parcha (`literal` uchun).
 * `null` — cheklov yo'q (hammasi ko'rinadi).
 *
 * Banner kabi mahsulotga HAVOLA qiluvchi yozuvlarda kerak: yashirin
 * mahsulotga bog'langan banner mehmonga ko'rinmasin (topshiriq №29, 1-band).
 */
export function visibleProductIdsSql(scope: CatalogScope): string | null {
  if (scope.kind === 'all') return null;
  const own = scope.kind === 'store' ? ` OR store_id = ${Number(scope.storeId)}` : '';
  return `(SELECT id FROM products WHERE (is_active = true AND store_id IN (SELECT id FROM stores WHERE is_active = true))${own})`;
}

/** `stores` uchun: o'z do'koni ko'rinadi, qolganlardan faqat faollari. */
export function storeVisibilityWhere(scope: CatalogScope): Record<string, any> {
  if (scope.kind === 'all') return {};
  if (scope.kind === 'store') {
    return { [Op.or]: [{ id: scope.storeId }, { is_active: true }] } as Record<string, any>;
  }
  return { is_active: true };
}

/** Bitta do'kon ko'rinadimi. */
export function storeVisible(store: { id: number; is_active: boolean }, scope: CatalogScope): boolean {
  if (scope.kind === 'all') return true;
  if (scope.kind === 'store' && store.id === scope.storeId) return true;
  return !!store.is_active;
}
