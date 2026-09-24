import { BadRequestException } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { StoreUser } from 'src/store_users/model/store_user.model';

/**
 * DO'KON XODIMI RUXSATLARI — topshiriq №35.
 *
 * Kodlar qat'iy: adminka (`src/lib/ruxsat.ts`) aynan shularni yuboradi.
 * Noma'lum kod — 400.
 */
export const PERMISSIONS = [
  'orders.view',
  'orders.edit',
  'carts.view',
  'carts.edit',
  'customers.view',
  'chat.view',
  'chat.reply',
  'reviews.view',
  'reviews.edit',
  'products.view',
  'products.edit',
  'prices.edit',
  'deliveries.view',
  'deliveries.edit',
  'couriers.view',
  'couriers.edit',
  'analytics.view',
  'store.view',
  'store.edit',
  'staff.view',
  'staff.edit',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** `*.edit` o'z `*.view` sini talab qiladi; saqlashda yetishmagani QO'SHILADI. */
const DEPENDS: Record<string, Permission> = {
  'chat.reply': 'chat.view',
  'prices.edit': 'products.view',
};
const dependencyOf = (p: string): Permission | null => {
  if (DEPENDS[p]) return DEPENDS[p];
  if (p.endsWith('.edit')) {
    const view = p.replace(/\.edit$/, '.view');
    return (PERMISSIONS as readonly string[]).includes(view) ? (view as Permission) : null;
  }
  return null;
};

/** Tekshiradi (noma'lum — 400) va bog'liqliklarni to'ldiradi. Tartib — PERMISSIONS dagidek. */
export function normalizePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input) || !input.length) {
    throw new BadRequestException("permissions bo'sh bo'lmasin");
  }
  const unknown = input.filter((p) => !(PERMISSIONS as readonly string[]).includes(String(p)));
  if (unknown.length) throw new BadRequestException(`Noma'lum ruxsat: ${unknown.join(', ')}`);
  const set = new Set<string>(input.map(String));
  for (const p of [...set]) {
    const dep = dependencyOf(p);
    if (dep) set.add(dep);
  }
  return PERMISSIONS.filter((p) => set.has(p));
}

/** Bazadagi (ehtimol eski) ro'yxatni ham bog'liqliklari bilan qaytaradi. */
export function expandPermissions(list: string[] | null | undefined): Permission[] {
  const set = new Set<string>((list || []).filter((p) => (PERMISSIONS as readonly string[]).includes(p)));
  for (const p of [...set]) {
    const dep = dependencyOf(p);
    if (dep) set.add(dep);
  }
  return PERMISSIONS.filter((p) => set.has(p));
}

export interface StaffInfo {
  role_id: number;
  role_name: string;
  permissions: Permission[];
}

/**
 * Xodimning roli (bazadan). `null` — kira olmaydi: rol yo'q/o'chirilgan,
 * rol boshqa do'konniki yoki do'kon nofaol (№35, 4-band).
 */
export async function staffInfo(user: { id: number; store_id?: number | null }): Promise<StaffInfo | null> {
  const [row] = (await StoreUser.sequelize.query(
    `SELECT r.id, r.name, r.permissions
       FROM store_users su
       JOIN store_roles r ON r.id = su.store_role_id AND r.store_id = su.store_id
       JOIN stores s ON s.id = su.store_id AND s.is_active
      WHERE su.id = :id`,
    { replacements: { id: user.id }, type: QueryTypes.SELECT },
  )) as any[];
  if (!row) return null;
  return {
    role_id: Number(row.id),
    role_name: String(row.name),
    permissions: expandPermissions(row.permissions),
  };
}

// ============================================================ marshrutlar xaritasi
/**
 * Xodim tokeni bilan qaysi marshrutga qaysi ruxsat kerak.
 *
 * DENY BY DEFAULT: bu ro'yxatda YO'Q marshrut xodimga yopiq (403). Yangi
 * endpoint qo'shilsa va bu yerga yozilmasa — xodim uni ololmaydi, do'kon
 * admini esa odatdagidek ishlaydi. Faqat do'kon adminiga qoladiganlar
 * (oferta qabul qilish, do'konni o'chirish/nofaol qilish, `store_admin`
 * hisoblari — `/store-users/*`) ataylab yozilmagan.
 *
 *   'any'      — har qanday xodim (o'z hisobi, ochiq ma'lumot);
 *   Permission — shu ruxsat;
 *   Permission[] — birortasi yetarli; `{ all }` — hammasi kerak;
 *   funksiya  — so'rovga qarab (narx o'zgarishi, `?kind=quote`).
 */
type Need = 'any' | Permission | Permission[] | { all: Permission[] };
type Rule = Need | ((req: any) => Need | Promise<Need>);

/** Narx/aksiya maydonlari — o'zgarsa `prices.edit` (№35, 1-band). */
const PRICE_FIELDS = ['price', 'sale_price', 'sale_starts_at', 'sale_ends_at'];

const same = (a: unknown, b: unknown) => {
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  if (empty(a) && empty(b)) return true;
  if (empty(a) || empty(b)) return false;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && typeof a !== 'object' && typeof b !== 'object') {
    if (!/[-:T]/.test(String(a)) && !/[-:T]/.test(String(b))) return na === nb;
  }
  const da = Date.parse(String(a instanceof Date ? a.toISOString() : a));
  const db = Date.parse(String(b instanceof Date ? b.toISOString() : b));
  if (!Number.isNaN(da) && !Number.isNaN(db)) return da === db;
  return String(a) === String(b);
};

const WITH_PRICE: Need = { all: ['products.edit', 'prices.edit'] };

/** Tanada narx maydoni bo'lsa va bazadagidan FARQ qilsa — `prices.edit` ham kerak. */
const priceGuarded =
  (table: string | null) =>
  async (req: any): Promise<Need> => {
    const body = req.body || {};
    const sent = PRICE_FIELDS.filter((f) => f in body);
    if (!sent.length) return 'products.edit';
    if (!table) {
      // Yaratish: bo'sh bo'lmagan narx — narx qo'yish
      return sent.some((f) => !same(body[f], null)) ? WITH_PRICE : 'products.edit';
    }
    const id = Number(req.params?.id);
    const [row] = (await StoreUser.sequelize.query(`SELECT ${sent.join(', ')} FROM "${table}" WHERE id = :id`, {
      replacements: { id },
      type: QueryTypes.SELECT,
    })) as any[];
    if (!row) return 'products.edit'; // yozuv yo'q — servis 404 beradi
    return sent.some((f) => !same(body[f], row[f])) ? WITH_PRICE : 'products.edit';
  };

/**
 * Mahsulot valyutasi (№37) — narxlarning MA'NOSINI o'zgartiradi (5 000 000 $
 * <-> 5 000 000 so'm), shuning uchun almashtirish `prices.edit` talab qiladi.
 */
const productUpdate = async (req: any): Promise<Need> => {
  const cur = req.body?.currency;
  if (cur === undefined || cur === null) return 'products.edit';
  const [row] = (await StoreUser.sequelize.query('SELECT currency FROM products WHERE id = :id', {
    replacements: { id: Number(req.params?.id) },
    type: QueryTypes.SELECT,
  })) as any[];
  return row && row.currency !== cur ? WITH_PRICE : 'products.edit';
};

export const STAFF_ROUTES: Record<string, Rule> = {
  // --- o'z hisobi, kirish, qurilma (har qanday xodim)
  'POST /api/store-auth/login': 'any',
  'POST /api/store-auth/refresh': 'any',
  'POST /api/store-auth/logout': 'any',
  'POST /api/store-auth/set-password': 'any',
  'GET /api/store-auth/me': 'any',
  'POST /api/store-auth/change-password': 'any',
  'GET /api/store-auth/logins': 'any',
  'POST /api/devices': 'any',
  'DELETE /api/devices/:token': 'any',
  'POST /api/devices/test': 'any',
  'GET /api/offers/current': 'any',
  'GET /api/health': 'any',

  // --- ochiq ma'lumot (katalog, do'konlar) — tokensiz ham ochiq
  'GET /api/banners/all': 'any',
  'GET /api/banners/one/:id': 'any',
  'GET /api/category/all': 'any',
  'GET /api/category/one/:id': 'any',
  'POST /api/category/slug': 'any',
  'GET /api/characteristics/all': 'any',
  'GET /api/characteristics/one/:id': 'any',
  'GET /api/product-images/all': 'any',
  'GET /api/product-images/one/:id': 'any',
  'GET /api/product-model-inside': 'any',
  'GET /api/product-model-inside/:id': 'any',
  'GET /api/product-model-inside/model/:modelId': 'any',
  'GET /api/products/all': 'any',
  'GET /api/products/allcount': 'any',
  'POST /api/products/bysort': 'any',
  'POST /api/products/categoryslug': 'any',
  'POST /api/products/lastadded': 'any',
  'GET /api/products/one/:id': 'any',
  'POST /api/products/search': 'any',
  'GET /api/reviews/one/:id': 'any',
  'GET /api/reviews/productone/:id': 'any',
  'GET /api/rishotkalar/all': 'any',
  'GET /api/rishotkalar/one/:id': 'any',
  'GET /api/settings/usd-rate': 'any',
  'GET /api/stores/all': 'any',
  // Bank rekvizitlari xodimga faqat `store.view` bilan (StoresService.canSeeRequisites)
  'GET /api/stores/one/:id': 'any',
  'GET /api/stores/slug/:slug': 'any',
  'GET /api/r2/r2-content': 'any',
  'GET /api/tracking/:token': 'any',

  // --- buyurtmalar
  'GET /api/orders/all': (req) => (req.query?.kind === 'quote' ? 'carts.view' : 'orders.view'),
  'GET /api/orders/:id': ['orders.view', 'carts.view'],
  'PATCH /api/orders/update/:id': 'orders.edit',
  'DELETE /api/orders/delete/:id': 'orders.edit',
  'GET /api/order-items/all': ['orders.view', 'carts.view'],
  'GET /api/order-items/one/:id': ['orders.view', 'carts.view'],
  'GET /api/order-items/oneuser/:id': ['orders.view', 'carts.view'],

  // --- savatlar va KP
  'GET /api/cart-items/all': 'carts.view',
  'GET /api/cart/one/:id': 'carts.view',
  'GET /api/cart/oneuser/:id': 'carts.view',
  'PUT /api/orders/:id/quote': 'carts.edit',
  'GET /api/orders/quote-stats': ['carts.view', 'analytics.view'],
  'GET /api/orders/quote-stats/unpriced': ['carts.view', 'analytics.view'],

  // --- mijozlar
  'GET /api/orders/oneuser/:id': 'customers.view',
  'GET /api/users/one/:id': 'customers.view',
  'GET /api/users/badges/:id': 'customers.view',
  'GET /api/likes/useralllikes/:id': 'customers.view',

  // --- chat (№34)
  'GET /api/chats': 'chat.view',
  'GET /api/chats/:id/messages': 'chat.view',
  'POST /api/chats/:id/read': 'chat.view',
  'POST /api/chats/:id/messages': 'chat.reply',

  // --- sharhlar
  'PATCH /api/reviews/update/:id': 'reviews.edit',
  'DELETE /api/reviews/delete/:id': 'reviews.edit',

  // --- mahsulotlar (narx — prices.edit)
  'GET /api/products/alladmin': 'products.view',
  'POST /api/products/create': priceGuarded(null),
  'PATCH /api/products/update/:id': productUpdate,
  'DELETE /api/products/delete/:id': 'products.edit',
  'POST /api/characteristics/create': priceGuarded(null),
  'PATCH /api/characteristics/update/:id': priceGuarded('characteristics'),
  'DELETE /api/characteristics/delete/:id': 'products.edit',
  'POST /api/product-model-inside': priceGuarded(null),
  'PATCH /api/product-model-inside/:id': priceGuarded('product-model-inside'),
  'DELETE /api/product-model-inside/:id': 'products.edit',
  'POST /api/product-images/create': 'products.edit',
  'PATCH /api/product-images/update/:id': 'products.edit',
  'DELETE /api/product-images/delete/:id': 'products.edit',
  'POST /api/images/upload-image': 'products.edit',
  'DELETE /api/images/upload-image': 'products.edit',
  'POST /api/r2/r2-upload': 'products.edit',
  'PUT /api/r2/r2-update': 'products.edit',
  'DELETE /api/r2/r2-object': 'products.edit',

  // --- yetkazishlar
  'GET /api/deliveries': 'deliveries.view',
  'GET /api/deliveries/:id': 'deliveries.view',
  'GET /api/deliveries/:id/incidents': 'deliveries.view',
  'GET /api/deliveries/:id/proofs/:proofId': 'deliveries.view',
  'GET /api/deliveries/stats': ['deliveries.view', 'analytics.view'],
  'POST /api/deliveries': 'deliveries.edit',
  'PATCH /api/deliveries/:id': 'deliveries.edit',
  'POST /api/deliveries/:id/assign': 'deliveries.edit',
  'POST /api/deliveries/:id/cancel': 'deliveries.edit',
  'POST /api/deliveries/:id/retry': 'deliveries.edit',
  'POST /api/deliveries/:id/return': 'deliveries.edit',
  'POST /api/deliveries/:id/tracking-link': 'deliveries.edit',

  // --- kuryerlar
  'GET /api/couriers': 'couriers.view',
  'GET /api/couriers/:id': 'couriers.view',
  'GET /api/couriers/:id/cash': 'couriers.view',
  'GET /api/couriers/:id/documents': 'couriers.view',
  'GET /api/couriers/:id/documents/:docId/url': 'couriers.view',
  'GET /api/couriers/:id/payouts': 'couriers.view',
  'GET /api/couriers/:id/shifts': 'couriers.view',
  'GET /api/couriers/:id/vehicles': 'couriers.view',
  'GET /api/couriers/:id/vehicles/:vid/events': 'couriers.view',
  'GET /api/courier-rates': 'couriers.view',
  'POST /api/couriers': 'couriers.edit',
  'PATCH /api/couriers/:id': 'couriers.edit',
  'DELETE /api/couriers/:id': 'couriers.edit',
  'POST /api/couriers/:id/cash-handover': 'couriers.edit',
  'POST /api/couriers/:id/documents': 'couriers.edit',
  'POST /api/couriers/:id/documents/verify': 'couriers.edit',
  'DELETE /api/couriers/:id/documents/verify': 'couriers.edit',
  'POST /api/couriers/:id/password-setup': 'couriers.edit',
  'POST /api/couriers/:id/payouts': 'couriers.edit',
  'POST /api/couriers/:id/vehicles': 'couriers.edit',
  'POST /api/couriers/:id/vehicles/:vid/approve': 'couriers.edit',
  'POST /api/couriers/:id/vehicles/:vid/reject': 'couriers.edit',
  'PUT /api/courier-rates': 'couriers.edit',

  // --- do'kon profili (is_active/name/slug — baribir faqat superadmin, №16)
  'PATCH /api/stores/update/:id': 'store.edit',

  // --- xodimlar va rollar (№35)
  'GET /api/store-roles': 'staff.view',
  'POST /api/store-roles': 'staff.edit',
  'PATCH /api/store-roles/:id': 'staff.edit',
  'DELETE /api/store-roles/:id': 'staff.edit',
  'GET /api/store-staff': 'staff.view',
  'POST /api/store-staff': 'staff.edit',
  'PATCH /api/store-staff/:id': 'staff.edit',
  'DELETE /api/store-staff/:id': 'staff.edit',
  'POST /api/store-staff/:id/password-setup': 'staff.edit',
};

/**
 * Xodim shu so'rovni bajara oladimi. `null` — ha; aks holda 403 javobi uchun
 * `required` (marshrut umuman xodimga yopiq bo'lsa `null` required bilan).
 */
export async function staffDecision(
  req: any,
  permissions: readonly string[],
): Promise<{ ok: true } | { ok: false; required: string | null }> {
  const key = `${String(req.method).toUpperCase()} ${req.route?.path ?? ''}`;
  const rule = STAFF_ROUTES[key];
  if (!rule) return { ok: false, required: null };
  const need = typeof rule === 'function' ? await rule(req) : rule;
  if (need === 'any') return { ok: true };
  if (typeof need === 'object' && !Array.isArray(need)) {
    const missing = need.all.find((p) => !permissions.includes(p));
    return missing ? { ok: false, required: missing } : { ok: true };
  }
  const options = Array.isArray(need) ? need : [need];
  if (options.some((p) => permissions.includes(p))) return { ok: true };
  return { ok: false, required: options[0] };
}
