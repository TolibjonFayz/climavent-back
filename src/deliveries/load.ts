import { QueryTypes, Transaction } from 'sequelize';
import { Delivery, DeliveryPickupInfo } from './model/models';
import { LoadLine, LoadSummary, VehicleClass, classCovers, summarizeLoad } from './vehicle-classes';

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
});

/** Mijozga ko'rinadigan yetkazish haqi (№47, 8-bo'lim) — faqat `customer` to'lovchida. */
export const customerFeeView = (d: Delivery) =>
  d.fee_payer === 'customer' && d.fee_status
    ? { amount: d.fee_cash ?? d.delivery_fee, payer: 'customer', status: d.fee_status, invoice_required: !!d.fee_invoice_required }
    : null;

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
  if (load.dimensions_missing.length) warnings.push("Yuk o'lchami to'liq kiritilmagan — mashinani do'kon bilan kelishing");
  if (info?.vehicle_class && load.suggested_class && !classCovers(info.vehicle_class as VehicleClass, load.suggested_class)) {
    warnings.push(`${info.vehicle_class} kichik — kamida ${load.suggested_class} kerak`);
  }
  return {
    delivery_id: d.id,
    pickup_info: info ? pickupInfoView(info) : null,
    total_weight_kg: load.total_weight_kg,
    total_volume_m3: load.total_volume_m3,
    suggested_class: load.suggested_class,
    needs_crane: load.needs_crane,
    split_suggested: load.split_suggested,
    warnings,
  };
}
