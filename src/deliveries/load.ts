import { QueryTypes, Transaction } from 'sequelize';
import { Delivery, DeliveryPickupInfo } from './model/models';
import { LoadLine, LoadSummary, VOLUME_UNKNOWN_WARNING, VehicleClass, classCovers, summarizeLoad } from './vehicle-classes';
import { settingNumber } from 'src/crews/trust';

/**
 * Yetkazish qatorlarining yuki (topshiriq №47, 3-bo'lim; №26, 7-band).
 * Har maydon alohida: variantda bo'lsa u, bo'lmasa modelniki. Standartlar
 * (`packages` 1, `needs_crane` false, `stackable` true) — `summarizeLoad` da.
 */
export async function loadSummaryOf(
  itemIds: number[] | null | undefined,
  opts: { floor?: number | null; has_elevator?: boolean | null; transaction?: Transaction } = {},
): Promise<LoadSummary> {
  if (!itemIds?.length) return summarizeLoad([], opts);
  const rows: any[] = await Delivery.sequelize.query(
    `SELECT i.id AS order_item_id, i.quantity,
            COALESCE(v.weight_kg, c.weight_kg) AS weight_kg,
            COALESCE(v.length_cm, c.length_cm) AS length_cm,
            COALESCE(v.width_cm, c.width_cm) AS width_cm,
            COALESCE(v.height_cm, c.height_cm) AS height_cm,
            COALESCE(v.packages, c.packages) AS packages,
            COALESCE(v.needs_crane, c.needs_crane) AS needs_crane,
            COALESCE(v.stackable, c.stackable) AS stackable
       FROM "order-items" i
       LEFT JOIN characteristics c ON c.id = i.product_model_id
       LEFT JOIN "product-model-inside" v ON v.id = i.product_model_inside_id
      WHERE i.id IN (:ids)
      ORDER BY i.id`,
    { replacements: { ids: itemIds }, type: QueryTypes.SELECT, transaction: opts.transaction },
  );
  const num = (x: any) => (x === null || x === undefined ? null : Number(x));
  const lines: LoadLine[] = rows.map((r) => ({
    order_item_id: Number(r.order_item_id),
    quantity: Number(r.quantity),
    weight_kg: num(r.weight_kg),
    length_cm: num(r.length_cm),
    width_cm: num(r.width_cm),
    height_cm: num(r.height_cm),
    packages: num(r.packages),
    needs_crane: r.needs_crane === null ? null : !!r.needs_crane,
    stackable: r.stackable === null ? null : !!r.stackable,
  }));
  return summarizeLoad(lines, opts);
}

/** Javob uchun qisqa ko'rinish (quote-fee, pickup-info, kuzatish). */
export const loadView = (s: LoadSummary) => ({
  total_weight_kg: s.total_weight_kg,
  total_volume_m3: s.total_volume_m3,
  needs_crane: s.needs_crane,
  suggested_class: s.suggested_class,
  split_suggested: s.split_suggested,
  loaders_suggested: s.loaders_suggested,
  dimensions_missing: s.dimensions_missing,
  // №49: og'irligi bor, gabariti yo'q — sinf faqat og'irlik bo'yicha
  volume_missing: s.volume_missing,
  volume_unknown: s.volume_unknown,
  warnings: s.volume_unknown ? [VOLUME_UNKNOWN_WARNING] : [],
});

/** Javobsiz taklif muddati (№48, A1) — daqiqada, `settings` dan. */
export const feeExpireMinutes = () => settingNumber(Delivery.sequelize, 'delivery_fee_expire_minutes', 240);
export const feeRemindMinutes = () => settingNumber(Delivery.sequelize, 'delivery_fee_remind_minutes', 60);

/**
 * Mijozga ko'rinadigan yetkazish haqi (№47, 8-bo'lim) — faqat `customer` to'lovchida.
 * №48: `proposed` da `expires_at` — sayt va ilova qolgan vaqtni ko'rsatadi.
 */
export async function customerFeeView(d: Delivery) {
  if (d.fee_payer !== 'customer' || !d.fee_status) return null;
  const expiresAt =
    d.fee_status === 'proposed' && d.fee_proposed_at
      ? new Date(new Date(d.fee_proposed_at).getTime() + (await feeExpireMinutes()) * 60000)
      : null;
  return {
    amount: d.fee_cash ?? d.delivery_fee,
    payer: 'customer',
    status: d.fee_status,
    invoice_required: !!d.fee_invoice_required,
    proposed_at: d.fee_proposed_at,
    expires_at: expiresAt,
  };
}

/**
 * Savat (katalog qatorlari) bo'yicha yuk (№48, A3) — buyurtma berishdan oldin, do'kon
 * kesimida: har do'kon o'z omboridan alohida yuklanadi.
 */
export async function catalogLoad(lines: { characteristic_id: number; product_model_inside_id?: number | null; quantity: number }[]) {
  const ids = [...new Set(lines.map((l) => Number(l.characteristic_id)).filter(Boolean))];
  if (!ids.length) return { ...loadView(summarizeLoad([])), stores: [] };
  const vids = [...new Set(lines.map((l) => Number(l.product_model_inside_id)).filter(Boolean))];
  const chars: any[] = await Delivery.sequelize.query(
    `SELECT c.id, c.weight_kg, c.length_cm, c.width_cm, c.height_cm, c.packages, c.needs_crane, c.stackable,
            p.store_id, s.name AS store_name, s.lat AS store_lat, s.lng AS store_lng, s.address AS store_address
       FROM characteristics c JOIN products p ON p.id = c.product_id LEFT JOIN stores s ON s.id = p.store_id
      WHERE c.id IN (:ids)`,
    { replacements: { ids }, type: QueryTypes.SELECT },
  );
  const variants: any[] = vids.length
    ? await Delivery.sequelize.query(
        `SELECT id, product_model_id, weight_kg, length_cm, width_cm, height_cm, packages, needs_crane, stackable
           FROM "product-model-inside" WHERE id IN (:vids)`,
        { replacements: { vids }, type: QueryTypes.SELECT },
      )
    : [];
  const num = (x: any) => (x === null || x === undefined ? null : Number(x));
  const pick = (v: any, c: any, k: string) => (v && v[k] !== null && v[k] !== undefined ? v[k] : c[k]);
  const byStore = new Map<number, { store: any; lines: LoadLine[] }>();
  const all: LoadLine[] = [];
  lines.forEach((l, i) => {
    const c = chars.find((x) => Number(x.id) === Number(l.characteristic_id));
    if (!c) return;
    const v = variants.find((x) => Number(x.id) === Number(l.product_model_inside_id) && Number(x.product_model_id) === Number(c.id));
    const line: LoadLine = {
      // Savatda qator raqami — tartib (0 dan); `dimensions_missing` shunga ishora qiladi
      order_item_id: i,
      quantity: Number(l.quantity),
      weight_kg: num(pick(v, c, 'weight_kg')),
      length_cm: num(pick(v, c, 'length_cm')),
      width_cm: num(pick(v, c, 'width_cm')),
      height_cm: num(pick(v, c, 'height_cm')),
      packages: num(pick(v, c, 'packages')),
      needs_crane: pick(v, c, 'needs_crane') === null ? null : !!pick(v, c, 'needs_crane'),
      stackable: pick(v, c, 'stackable') === null ? null : !!pick(v, c, 'stackable'),
    };
    all.push(line);
    const sid = Number(c.store_id);
    if (!byStore.has(sid)) {
      byStore.set(sid, {
        store: {
          id: sid,
          name: c.store_name,
          address: c.store_address ?? null,
          lat: c.store_lat === null ? null : Number(c.store_lat),
          lng: c.store_lng === null ? null : Number(c.store_lng),
        },
        lines: [],
      });
    }
    byStore.get(sid).lines.push(line);
  });
  return {
    ...loadView(summarizeLoad(all)),
    stores: [...byStore.values()].map((x) => ({ store: x.store, ...loadView(summarizeLoad(x.lines)) })),
  };
}

export const pickupInfoView = (i: DeliveryPickupInfo) => ({
  driver_name: i.driver_name,
  driver_phone: i.driver_phone,
  vehicle_plate: i.vehicle_plate,
  vehicle_class: i.vehicle_class,
  arrive_from: i.arrive_from,
  arrive_to: i.arrive_to,
  poa_number: i.poa_number,
  poa_document_id: i.poa_document_id,
  updated_at: i.updated_at,
});

/** Mijozga: yuborgan ma'lumoti + qanday mashina yuborish kerak (№47, 7-bo'lim). */
export async function customerPickupView(d: Delivery, info?: DeliveryPickupInfo | null) {
  if (info === undefined) info = await DeliveryPickupInfo.findByPk(d.id);
  const load = await loadSummaryOf(d.items);
  const warnings: string[] = [];
  if (load.needs_crane) warnings.push('Yukni ortish uchun kran (manipulyator) kerak — kranli mashina yuboring');
  if (load.split_suggested) warnings.push(`Yuk bitta mashinaga sig'maydi — ${load.split_suggested.length} ta mashina kerak`);
  if (load.dimensions_missing.length) warnings.push("Yuk og'irligi to'liq kiritilmagan — mashinani do'kon bilan kelishing");
  if (load.volume_unknown) warnings.push(VOLUME_UNKNOWN_WARNING);
  if (info?.vehicle_class && load.suggested_class && !classCovers(info.vehicle_class as VehicleClass, load.suggested_class)) {
    warnings.push(`${info.vehicle_class} kichik — kamida ${load.suggested_class} kerak`);
  }
  return {
    delivery_id: d.id,
    pickup_info: info ? pickupInfoView(info) : null,
    total_weight_kg: load.total_weight_kg,
    total_volume_m3: load.total_volume_m3,
    volume_unknown: load.volume_unknown,
    suggested_class: load.suggested_class,
    needs_crane: load.needs_crane,
    split_suggested: load.split_suggested,
    warnings,
  };
}
