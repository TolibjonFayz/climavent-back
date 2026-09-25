import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { QueryTypes } from 'sequelize';
import {
  ETA_CITY_FACTOR,
  ETA_MIN_MINUTES,
  ETA_SPEED_KMH,
  LOCATION_STALE_MS,
  TRACKING_AFTER_FINISH_MS,
  TRACKING_BASE_URL,
  TRACKING_LINK_PATH,
} from './constants';
import { Courier, CourierVehicle, Delivery, DeliveryEvent } from './model/models';

/**
 * Havola kaliti: **16 bayt tasodifiy -> 32 ta hex belgi** (`0-9a-f`).
 *
 * Nega base64url emas (avval 32 bayt / 43 belgi edi): Eskiz shablonidagi
 * `%w` bitta "so'z" ni kutadi va `-` / `_` belgilari unga mos kelmasligi
 * mumkin; uzun token esa SMS'ni 160 belgidan oshirib, narxini ikkilantiradi.
 * 16 bayt = 128 bit — taxmin qilib topish imkonsiz.
 */
export function newTrackingToken(): { raw: string; hash: string } {
  const raw = randomBytes(16).toString('hex');
  return { raw, hash: hashToken(raw) };
}

/** Bazada FAQAT xesh turadi (№21 dagi refresh tokenlar kabi). */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

const linkPath = (raw: string) => {
  const p = TRACKING_LINK_PATH.startsWith('/') ? TRACKING_LINK_PATH : `/${TRACKING_LINK_PATH}`;
  return `${p.endsWith('/') ? p : `${p}/`}${raw}`;
};

/** To'liq havola — adminka javobi uchun. */
export const trackingUrl = (raw: string) => `${TRACKING_BASE_URL}${linkPath(raw)}`;

/**
 * SMS uchun havola — **protokolsiz** (`climavent.uz/k/<token>`).
 * Eskiz shabloni #90539 aynan shunday topshirilgan; `https://` qo'shilsa
 * matn shablonga mos kelmaydi va SMS rad etiladi.
 */
export const trackingSmsLink = (raw: string) =>
  `${TRACKING_BASE_URL.replace(/^https?:\/\//, '')}${linkPath(raw)}`;

/** Koordinata ~11 metrgacha yumaloqlanadi — mijozga aniq uy kerak emas. */
const round4 = (v: unknown) => (v === null || v === undefined ? null : Number(Number(v).toFixed(4)));

/** To'g'ri masofa (km). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Yetkazish yakunlangan holatlar — havola shundan keyin 24 soat yashaydi. */
const FINISHED: Record<string, keyof Delivery> = {
  delivered: 'delivered_at',
  failed: 'failed_at',
  cancelled: 'cancelled_at',
  returned: 'returned_at',
};

/**
 * Mijoz uchun OCHIQ kuzatish (topshiriq №24, 2-band).
 *
 * Guvohnoma yo'q — SMS'dagi havolaning o'zi kalit. Shuning uchun javobda
 * FAQAT mijozning o'ziga tegishli narsa bo'lishi kerak:
 *
 *   - kuryer joylashuvi — faqat `picked_up` / `on_the_way` da, 4 xonagacha
 *     yumaloqlangan; `last_seen_at` 5 daqiqadan eski bo'lsa `stale: true`;
 *   - kuryer ismi — familiyasiz; telefoni — faqat `on_the_way` da;
 *   - manzil — mijozning O'Z manzili, lekin `dropoff_details` (kvartira,
 *     qavat) BERILMAYDI: havola boshqa qo'lga tushsa ham uyning ichki
 *     tafsiloti oshkor bo'lmasin;
 *   - yakunlangandan keyin joylashuv ham, telefon ham `null`;
 *   - tarixda `actor_id`, kuryer ID, do'kon ID, mijoz telefoni YO'Q.
 */
@Injectable()
export class TrackingService {
  async track(token: string) {
    const raw = String(token || '');
    // Har qanday noto'g'ri token uchun ish hajmi bir xil bo'lsin: xesh
    // doim hisoblanadi, bazaga doim boriladi (timing orqali tokenning
    // borligini bilib bo'lmasin).
    const hash = hashToken(raw);
    const d = /^[0-9a-f]{32}$/.test(raw)
      ? await Delivery.findOne({ where: { tracking_token_hash: hash } })
      : null;
    if (!d) throw new NotFoundException('Topilmadi');

    // Yakunlangandan keyin havola 24 soat yashaydi — mijoz "topshirildi"
    // ni ko'rib ulgursin, keyin yopiladi.
    const finishedField = FINISHED[d.status];
    const finishedAt = finishedField ? (d[finishedField] as unknown as Date | null) : null;
    if (finishedAt && Date.now() - new Date(finishedAt).getTime() > TRACKING_AFTER_FINISH_MS) {
      throw new GoneException("Havola muddati o'tgan");
    }
    const [store] = (await Delivery.sequelize.query(
      'SELECT name, phone FROM stores WHERE id = :id',
      { replacements: { id: d.store_id }, type: QueryTypes.SELECT },
    )) as any[];

    const view = await customerDeliveryView(d);
    const items = d.items?.length
      ? ((await Delivery.sequelize.query(
          `SELECT COALESCE(p.name_uz, p.name_ru, p.name_en) AS name, i.product_model AS model, i.quantity
             FROM "order-items" i LEFT JOIN products p ON p.id = i.product_id
            WHERE i.id IN (:ids) ORDER BY i.id`,
          { replacements: { ids: d.items }, type: QueryTypes.SELECT },
        )) as any[])
      : [];

    return {
      status: view.status,
      // Holat `on_the_way` da qoladi, lekin sahifa "Kuryer yetib keldi"
      // deb ko'rsatishi kerak (topshiriq №26, 4-band). SMS yuborilmaydi.
      arrived_at: view.arrived_at,
      steps: view.steps,
      order_id: d.order_id,
      store: store ? { name: store.name, phone: store.phone ?? null } : null,
      courier: view.courier,
      courier_location: view.courier_location,
      destination: view.destination,
      window: view.window,
      eta_minutes: view.eta_minutes,
      cod_amount: view.cod_amount,
      items: items.map((i) => ({ name: i.name, model: i.model, quantity: Number(i.quantity) })),
      delivered_at: view.delivered_at,
    };
  }
}

/**
 * Yetkazishning mijozga ko'rinadigan qismi — YAGONA funksiya (№24 va №38):
 * SMS havolasidagi sahifa ham, ilovadagi `GET /orders/:id/tracking` ham
 * shundan foydalanadi, maxfiylik qoidalari ikki joyda takrorlanmaydi.
 *
 *   - kuryer joylashuvi — faqat `picked_up` / `on_the_way` da, 4 xonagacha
 *     yumaloqlangan; `last_seen_at` 5 daqiqadan eski bo'lsa `stale: true`;
 *   - kuryer — faqat ism; telefoni va davlat raqami — faqat `on_the_way` da;
 *   - `dropoff_details` (kvartira, qavat) BERILMAYDI;
 *   - yakunlangandan keyin joylashuv ham, telefon ham `null`;
 *   - kuryer, xodim, actor ID lari YO'Q.
 */
export async function customerDeliveryView(d: Delivery) {
  const finished = !!FINISHED[d.status];

  const events = await DeliveryEvent.findAll({
    where: { delivery_id: d.id, event: null },
    attributes: ['from_status', 'to_status', 'created_at'],
    order: [['id', 'ASC']],
  });
  // Har holat — BIRINCHI marta kirilgan vaqti bilan. Tahrir yozuvlari
  // (from === to) ko'rsatilmaydi; `pending` va `assigned` ham — ular
  // ICHKI qadamlar (operator kuryer izlayapti), mijoz uchun qadam
  // "Qabul qilindi" dan boshlanadi (topshiriq №24, 2-band namunasi).
  const HIDDEN: string[] = ['pending', 'assigned'];
  const seen = new Set<string>();
  const steps: { status: string; at: Date }[] = [];
  for (const e of events) {
    if (e.from_status === e.to_status || HIDDEN.includes(e.to_status)) continue;
    if (seen.has(e.to_status)) continue;
    seen.add(e.to_status);
    steps.push({ status: e.to_status, at: e.created_at });
  }

  const showLocation = !finished && (d.status === 'picked_up' || d.status === 'on_the_way');
  const showPhone = !finished && d.status === 'on_the_way';

  let courier: any = null;
  let courierLocation: any = null;
  let etaMinutes: number | null = null;

  if (d.courier_id) {
    const c = await Courier.findByPk(d.courier_id, {
      attributes: [
        'full_name', 'phone', 'vehicle_type', 'active_vehicle_id',
        'last_lat', 'last_lng', 'last_heading', 'last_speed', 'last_seen_at',
      ],
    });
    if (c) {
      // Faol transport (topshiriq №26, 1a-band): mijoz mashinani
      // tanishi uchun rusum va rang; DAVLAT RAQAMI faqat `on_the_way` da
      // — kuryer yo'lga chiqmaguncha uni bilishning hojati yo'q.
      const v = c.active_vehicle_id ? await CourierVehicle.findByPk(c.active_vehicle_id) : null;
      courier = {
        // Faqat ism — familiya mijozga kerak emas
        first_name: String(c.full_name || '').trim().split(/\s+/)[0] || null,
        vehicle_type: v?.vehicle_type ?? c.vehicle_type,
        vehicle: v
          ? {
              type: v.vehicle_type,
              model: v.model,
              color: v.color,
              plate: showPhone ? v.plate : null,
            }
          : null,
        phone: showPhone ? c.phone : null,
      };
      if (showLocation) {
        const loc = workerLocationView(c, { lat: d.dropoff_lat, lng: d.dropoff_lng });
        courierLocation = loc.location;
        etaMinutes = loc.eta_minutes;
      }
    }
  }

  return {
    id: d.id,
    status: d.status,
    // Holat `on_the_way` da qoladi, lekin sahifa "Kuryer yetib keldi"
    // deb ko'rsatishi kerak (topshiriq №26, 4-band). SMS yuborilmaydi.
    arrived_at: finished ? null : d.arrived_at,
    steps,
    courier,
    courier_location: courierLocation,
    destination: {
      lat: d.dropoff_lat,
      lng: d.dropoff_lng,
      // `dropoff_details` (kirish, qavat, xonadon) ATAYLAB berilmaydi
      address: d.dropoff_address,
    },
    window: { from: d.window_from, to: d.window_to },
    eta_minutes: etaMinutes,
    cod_amount: d.cod_amount,
    delivered_at: d.delivered_at,
  };
}

/**
 * Kuryer/usta joylashuvi va yetib borish bahosi (№24; №39 dagi ishlar ham).
 * Chaqiruvchi faqat ko'rsatish mumkin bo'lgan holatda chaqiradi.
 *   - 4 xonagacha yaxlitlanadi (~11 m);
 *   - `last_seen_at` 5 daqiqadan eski bo'lsa `stale: true` va ETA yo'q;
 *   - ETA: to'g'ri masofa x 1,4 (shahar yo'llari) / 25 km/soat.
 */
export function workerLocationView(
  c: { last_lat: number | null; last_lng: number | null; last_seen_at: Date | null; last_heading?: number | null },
  dest: { lat: number | null; lng: number | null },
) {
  if (c.last_lat === null || c.last_lng === null || !c.last_seen_at) return { location: null, eta_minutes: null };
  const stale = Date.now() - new Date(c.last_seen_at).getTime() > LOCATION_STALE_MS;
  const location = {
    lat: round4(c.last_lat),
    lng: round4(c.last_lng),
    at: c.last_seen_at,
    stale,
    // GPS'dan kelgan yo'nalish — xaritadagi mashinacha to'g'ri
    // tomonga burilsin (topshiriq №26, 5-band)
    heading: c.last_heading ?? null,
  };
  let eta: number | null = null;
  if (!stale && dest.lat !== null && dest.lat !== undefined && dest.lng !== null && dest.lng !== undefined) {
    const km = haversineKm(Number(c.last_lat), Number(c.last_lng), Number(dest.lat), Number(dest.lng));
    eta = Math.max(ETA_MIN_MINUTES, Math.round(((km * ETA_CITY_FACTOR) / ETA_SPEED_KMH) * 60));
  }
  return { location, eta_minutes: eta };
}
