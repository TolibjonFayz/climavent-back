import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { QueryTypes, Transaction } from 'sequelize';
import { OrderItem } from 'src/order_items/model/order_item.model';
import { recordOrderEvent } from 'src/orders/order-events';
import { isDistrict, isRegion, regionOfDistrict } from 'src/regions/regions.data';
import { pushQuoteRequest } from 'src/deliveries/store-push';
import { Service, ServiceCategory, ServiceVariant } from 'src/service_catalog/models';
import { CUSTOMER_PHOTOS_MAX, ServiceJob, ServiceJobEvent } from './models';
import { pushStoreNewServiceOrder } from './job-push';

/**
 * Xizmatni buyurtma qilish — topshiriq №39, 4-band.
 *
 * Alohida buyurtma turi OCHILMAYDI: xizmat mavjud `orders` ga qator bo'lib
 * tushadi (KP, chat, `order_updated`, to'lov o'zgarishsiz ishlaydi). Har bir
 * hamkor uchun bitta ish (`service_jobs`) avtomatik ochiladi.
 *
 * Tekshiruvlar buyurtma yozilishidan OLDIN (`prepareServiceLines`): hududdan
 * tashqari xizmat 409 bo'lsa, yarim buyurtma bazada qolib ketmasin.
 */
const logger = new Logger('ServiceOrders');

export interface ServiceLineInput {
  index: number;
  service_id: number;
  variant_id: number;
  quantity: number;
  for_item_index?: number | null;
}

export interface PreparedServiceLine extends ServiceLineInput {
  store_id: number;
  price_type: string;
  /** Qatorga QOTIB yoziladigan narx: `fixed` — narx, `from` — "…dan" narx, `quote` — null. */
  price: number | null;
  visit_fee: number | null;
  warranty_months: number;
  category_key: string;
  /** `product_model` ustuniga — matnli nom (xizmat — variant). */
  title: string;
}

export interface ServiceMeta {
  preferred_date?: string;
  window_from?: string;
  window_to?: string;
  comment?: string;
  photos?: string[];
}

/** Rasm faqat bizning yuklash yo'lidan (Cloudinary) — begona havola bazaga tushmasin. */
export function assertOwnPhotoUrls(urls: string[] | undefined, max: number, field = 'photos') {
  const list = urls || [];
  if (list.length > max) throw new BadRequestException(`${field}: ${max} tagacha rasm`);
  const bad = list.filter((u) => !/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(String(u)));
  if (bad.length) {
    throw new BadRequestException(`${field}: faqat yuklash yo'li qaytargan havolalar (POST /api/uploads/service-photo)`);
  }
  return list.map(String);
}

/** Hudud kodlari: tuman berilsa viloyat undan aniqlanadi. Noto'g'ri kod — 400. */
export function resolveArea(region?: string | null, district?: string | null) {
  const d = district ? String(district) : null;
  const r = region ? String(region) : regionOfDistrict(d);
  if (r && !isRegion(r)) throw new BadRequestException(`Noma'lum viloyat: ${r}`);
  if (d && !isDistrict(d, r)) throw new BadRequestException(`${d} tumani ${r ?? ''} ga tegishli emas`.trim());
  return { region_code: r, district_code: d };
}

/**
 * Xizmat qatorlarini tekshiradi va narxini aniqlaydi (hali hech narsa yozmaydi).
 *   - xizmat va variant faol, variant shu xizmatniki;
 *   - hamkor faol va `sells_services`;
 *   - hamkor manzil hududiga xizmat ko'rsatadi — aks holda 409;
 *   - `for_item_index` shu so'rovdagi TOVAR qatoriga ishora qiladi.
 */
export async function prepareServiceLines(
  lines: ServiceLineInput[],
  ctx: { region_code: string | null; district_code: string | null; productIndexes: Set<number> },
): Promise<PreparedServiceLine[]> {
  if (!lines.length) return [];
  if (!ctx.region_code) {
    throw new BadRequestException('Xizmat uchun manzil hududi majburiy: region_code yoki district_code');
  }
  const out: PreparedServiceLine[] = [];
  for (const line of lines) {
    const service = await Service.findByPk(line.service_id);
    if (!service) throw new NotFoundException(`Xizmat topilmadi (service_id ${line.service_id})`);
    const variant = await ServiceVariant.findOne({ where: { id: line.variant_id, service_id: service.id } });
    if (!variant) throw new BadRequestException(`variant_id ${line.variant_id} bu xizmatniki emas`);
    const category = await ServiceCategory.findByPk(service.category_id);
    const [store]: any[] = await Service.sequelize.query(
      'SELECT id, is_active, sells_services FROM stores WHERE id = :id',
      { replacements: { id: service.store_id }, type: QueryTypes.SELECT },
    );
    if (!service.is_active || !variant.is_active || !category?.is_active || !store?.is_active || !store?.sells_services) {
      throw new ConflictException(`Xizmat hozir mavjud emas (service_id ${service.id})`);
    }
    const [area]: any[] = await Service.sequelize.query(
      `SELECT 1 AS ok FROM store_service_areas
        WHERE store_id = :store AND region_code = :region
          AND (district_code IS NULL OR district_code = :district)
        LIMIT 1`,
      {
        replacements: { store: service.store_id, region: ctx.region_code, district: ctx.district_code ?? '' },
        type: QueryTypes.SELECT,
      },
    );
    if (!area) throw new ConflictException("Bu usta sizning hududingizga xizmat ko'rsatmaydi");
    if (line.for_item_index !== undefined && line.for_item_index !== null && !ctx.productIndexes.has(line.for_item_index)) {
      throw new BadRequestException(`for_item_index ${line.for_item_index}: shu so'rovdagi tovar qatori emas`);
    }
    const price = service.price_type === 'quote' ? null : variant.price_uzs;
    if (service.price_type !== 'quote' && (price === null || price === undefined)) {
      throw new ConflictException(`Xizmat narxi yozilmagan (variant ${variant.id})`);
    }
    out.push({
      ...line,
      store_id: service.store_id,
      price_type: service.price_type,
      price: price === null || price === undefined ? null : Number(price),
      visit_fee: service.price_type === 'from' ? service.visit_fee_uzs ?? null : null,
      warranty_months: service.warranty_months,
      category_key: category.key,
      title: `${service.name_uz} — ${variant.name_uz}`.slice(0, 255),
    });
  }
  return out;
}

/**
 * Mijoz taklif qilgan vaqt (Toshkent, UTC+5, yozgi vaqt yo'q).
 * Faqat kun berilsa — 09:00–18:00. O'tgan kun — 400.
 */
export function customerWindow(meta?: ServiceMeta | null): { from: Date | null; to: Date | null } {
  if (!meta?.preferred_date) {
    if (meta?.window_from || meta?.window_to) throw new BadRequestException('window_from/window_to preferred_date bilan beriladi');
    return { from: null, to: null };
  }
  const from = new Date(`${meta.preferred_date}T${meta.window_from || '09:00'}:00+05:00`);
  const to = new Date(`${meta.preferred_date}T${meta.window_to || '18:00'}:00+05:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new BadRequestException("preferred_date noto'g'ri");
  if (to.getTime() <= from.getTime()) throw new BadRequestException("window_to window_from dan keyin bo'lsin");
  const todayTashkent = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  if (meta.preferred_date < todayTashkent) throw new BadRequestException("preferred_date o'tib ketgan kun");
  return { from, to };
}

/**
 * Xizmat qatorlarini yozadi va HAR HAMKOR UCHUN BITTA ish ochadi.
 * `itemIdByIndex` — shu so'rovdagi tovar qatorlarining yaratilgan id lari.
 */
export async function createServiceLinesAndJobs(
  order: any,
  prepared: PreparedServiceLine[],
  itemIdByIndex: Map<number, number>,
  meta: ServiceMeta | undefined,
  actor: { type: 'customer' | 'superadmin'; id: number | null },
): Promise<ServiceJob[]> {
  if (!prepared.length) return [];
  const window = customerWindow(meta);
  const photos = assertOwnPhotoUrls(meta?.photos, CUSTOMER_PHOTOS_MAX);
  const seq = OrderItem.sequelize;

  const jobs = await seq.transaction(async (t: Transaction) => {
    const byStore = new Map<number, { line: PreparedServiceLine; itemId: number }[]>();
    for (const line of prepared) {
      const row = await OrderItem.create(
        {
          order_id: order.id,
          item_type: 'service',
          product_id: null,
          service_id: line.service_id,
          service_variant_id: line.variant_id,
          for_order_item_id:
            line.for_item_index === undefined || line.for_item_index === null
              ? null
              : itemIdByIndex.get(line.for_item_index) ?? null,
          product_model: line.title,
          quantity: line.quantity,
          // Narx buyurtma paytida QOTIB yoziladi (№37 dagidek): hamkor keyin
          // narxni o'zgartirsa ham bu buyurtma o'zgarmaydi.
          price: line.price,
          regular_price: line.price,
          price_type: line.price_type,
          visit_fee_uzs: line.visit_fee,
        } as any,
        { transaction: t },
      );
      byStore.set(line.store_id, [...(byStore.get(line.store_id) || []), { line, itemId: row.id }]);
    }

    const created: ServiceJob[] = [];
    for (const [storeId, rows] of byStore) {
      const quoted = rows.every((x) => x.line.price !== null)
        ? rows.reduce((s, x) => s + Number(x.line.price) * x.line.quantity, 0)
        : null;
      const fees = rows.map((x) => x.line.visit_fee).filter((x) => x !== null) as number[];
      const job = await ServiceJob.create(
        {
          order_id: order.id,
          store_id: storeId,
          status: 'pending',
          items: rows.map((x) => x.itemId),
          address: order.location ?? null,
          lat: order.lat ?? null,
          lng: order.lng ?? null,
          address_details: order.address_details ?? null,
          recipient_name: order.recipient_name ?? null,
          recipient_phone: order.recipient_phone ?? null,
          comment: meta?.comment?.trim() || null,
          customer_photos: photos,
          customer_from: window.from,
          customer_to: window.to,
          scheduled_from: window.from,
          scheduled_to: window.to,
          schedule_status: 'proposed',
          quoted_amount: quoted,
          // Bitta tashrif — chiqish haqi bitta (eng kattasi)
          visit_fee_uzs: fees.length ? Math.max(...fees) : null,
          // Standart: ish joyida naqd. Oldindan to'langan bo'lsa hamkor PATCH bilan o'zgartiradi.
          cod_amount: order.status === 'paid' ? 0 : quoted ?? 0,
        } as any,
        { transaction: t },
      );
      await ServiceJobEvent.create(
        {
          job_id: job.id,
          from_status: null,
          to_status: 'pending',
          actor_type: actor.type,
          actor_id: actor.id,
          comment: 'Buyurtma bilan yaratildi',
          created_at: new Date(),
        } as any,
        { transaction: t },
      );
      await recordOrderEvent({
        order_id: order.id,
        store_id: storeId,
        event: 'job_created',
        actor_type: actor.type,
        actor_id: actor.id,
        note: `Ish #${job.id}: ${rows.map((x) => x.line.title).join('; ')}`.slice(0, 1000),
        transaction: t,
      });
      created.push(job);
    }
    return created;
  });

  // Hamkorga push (9-band). Narxsiz (`quote`) qator bo'lsa — KP so'rovi push'i.
  for (const job of jobs) {
    try {
      const rows = prepared.filter((x) => x.store_id === job.store_id);
      const unpriced = rows.filter((x) => x.price === null).length;
      if (unpriced) {
        await pushQuoteRequest(order.id, job.store_id, unpriced);
        continue;
      }
      const first = rows[0]?.title || 'Xizmat';
      const more = rows.length > 1 ? ` va yana ${rows.length - 1} ta` : '';
      const when = job.scheduled_from
        ? ` · ${new Intl.DateTimeFormat('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(job.scheduled_from)}`
        : '';
      await pushStoreNewServiceOrder(order.id, job.id, job.store_id, `${first}${more}${when}`);
    } catch (e) {
      logger.warn(`Xizmat push'i (buyurtma #${order.id}): ${(e as Error).message}`);
    }
  }
  return jobs;
}

/**
 * KP qabul qilingandan keyin (№21/№33) ish summalari qatorlardagi yangi
 * narxdan qayta hisoblanadi — `quote` narxli xizmatga narxni hamkor KP da yozadi.
 */
export async function refreshJobAmounts(sequelize: any, orderId: number, t?: Transaction) {
  const jobs = await ServiceJob.findAll({ where: { order_id: orderId, parent_job_id: null }, transaction: t });
  for (const job of jobs) {
    if (!['pending', 'assigned', 'accepted'].includes(job.status)) continue;
    const rows: any[] = await sequelize.query(
      `SELECT price, quantity FROM "order-items" WHERE id IN (:ids)`,
      { replacements: { ids: job.items.length ? job.items : [-1] }, type: QueryTypes.SELECT, transaction: t },
    );
    const quoted = rows.length && rows.every((r) => r.price !== null)
      ? rows.reduce((s, r) => s + Number(r.price) * Number(r.quantity), 0)
      : null;
    if (quoted === job.quoted_amount) continue;
    // Oldindan to'langan qism saqlanadi: cod = yangi summa - (eski summa - eski cod)
    const prepaid = Math.max((job.quoted_amount ?? 0) - Number(job.cod_amount || 0), 0);
    await job.update(
      { quoted_amount: quoted, cod_amount: Math.max((quoted ?? 0) - prepaid, 0) } as any,
      { transaction: t },
    );
  }
}
