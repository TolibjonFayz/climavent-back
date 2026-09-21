// Kuryerlar va yetkazish — yagona manba (topshiriq №22).

export const VEHICLES = ['foot', 'bike', 'car', 'van', 'truck'] as const;
export type Vehicle = (typeof VEHICLES)[number];

/** Transport "sig'imi": kuryer transporti talab qilingandan kichik bo'lmasligi kerak. */
export const vehicleFits = (courier: string, required: string) =>
  VEHICLES.indexOf(courier as Vehicle) >= VEHICLES.indexOf(required as Vehicle);

export const DELIVERY_STATUSES = [
  'pending',
  'assigned',
  'accepted',
  'picked_up',
  'on_the_way',
  'delivered',
  'failed',
  'returned',
  'cancelled',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** Kuryer qo'lidagi (faol) holatlar. */
export const ACTIVE_STATUSES: DeliveryStatus[] = ['assigned', 'accepted', 'picked_up', 'on_the_way'];
/** Kuryer tarixidagi holatlar. */
export const HISTORY_STATUSES: DeliveryStatus[] = ['delivered', 'failed', 'returned', 'cancelled'];

export const FAILURE_REASONS = ['client_unreachable', 'client_refused', 'wrong_address', 'damaged', 'other'] as const;

export type ActorType = 'superadmin' | 'store' | 'courier' | 'system';

/**
 * Ruxsat etilgan o'tishlar (topshiriq №22, 3-band). Boshqa har qanday o'tish — 409.
 */
export const TRANSITIONS: Record<
  string,
  { from: DeliveryStatus[]; to: DeliveryStatus; by: 'backoffice' | 'courier' }
> = {
  // Qayta biriktirish ham (assigned → assigned): kuryer javob bermasa almashtirish uchun
  assign: { from: ['pending', 'assigned'], to: 'assigned', by: 'backoffice' },
  reject: { from: ['assigned'], to: 'pending', by: 'courier' },
  accept: { from: ['assigned'], to: 'accepted', by: 'courier' },
  pickup: { from: ['accepted'], to: 'picked_up', by: 'courier' },
  start: { from: ['picked_up'], to: 'on_the_way', by: 'courier' },
  deliver: { from: ['on_the_way'], to: 'delivered', by: 'courier' },
  fail: { from: ['on_the_way'], to: 'failed', by: 'courier' },
  return: { from: ['failed'], to: 'returned', by: 'backoffice' },
  retry: { from: ['failed'], to: 'pending', by: 'backoffice' },
  cancel: {
    from: ['pending', 'assigned', 'accepted', 'picked_up', 'on_the_way', 'failed'],
    to: 'cancelled',
    by: 'backoffice',
  },
};

/** Topshirish kodi: 4 raqam, 5 ta noto'g'ri urinishdan keyin bloklanadi (5-band). */
export const PROOF_CODE_MAX_ATTEMPTS = 5;
/** Tarixda mijoz telefoni va aniq manzil shuncha vaqtdan keyin yashiriladi (4-band). */
export const HISTORY_MASK_AFTER_MS = 24 * 60 * 60 * 1000;
/** Yo'l tarixi saqlanish muddati (6-band). */
export const LOCATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** Isbot rasmi: JPEG/PNG/WebP, 8 MB gacha. */
export const PROOF_MAX_BYTES = 8 * 1024 * 1024;

// ============================================================ kuzatish (topshiriq №24)

/** Mijoz kuzatish sahifasining manzili (SMS'dagi havola shundan yig'iladi). */
export const TRACKING_BASE_URL = (process.env.PUBLIC_SITE_URL || 'https://climavent.uz').replace(/\/+$/, '');
/**
 * Havola yo'li — standart **`/k/`**: sayt uni server tomonida
 * `/kuzatish/<token>` ga 301 bilan yo'naltiradi (tasdiqlangan 21.09).
 * SMS shabloni #90539 aynan shu qisqa yo'l bilan topshirilgan.
 */
export const TRACKING_LINK_PATH = process.env.TRACKING_LINK_PATH || '/k/';
/** Yetkazish yakunlangandan keyin havola shuncha vaqt yashaydi, keyin 410. */
export const TRACKING_AFTER_FINISH_MS = 24 * 60 * 60 * 1000;
/** Kuryer joylashuvi shundan eski bo'lsa — `stale: true` va ETA yo'q. */
export const LOCATION_STALE_MS = 5 * 60 * 1000;
/**
 * Yo'l tarixiga yozish oralig'i. Kuzatish ochiq bo'lgani uchun kuryer
 * sahifasi `on_the_way` da 15 soniyada bir yuboradi — `couriers.last_*`
 * har safar yangilanadi, lekin `courier_locations` ga bundan tez kelgan
 * nuqta YOZILMAYDI (jadval hajmi oshmasin).
 */
export const LOCATION_HISTORY_MIN_MS = 15 * 1000;
/** ETA: to'g'ri masofa x 1,4 (shahar yo'llari) / 25 km/soat, pastki chegara 3 daqiqa. */
export const ETA_CITY_FACTOR = 1.4;
export const ETA_SPEED_KMH = 25;
export const ETA_MIN_MINUTES = 3;
/** Kuzatish havolasini faqat shu holatlarda olish mumkin (aks holda 409). */
export const TRACKING_LINK_STATUSES: DeliveryStatus[] = ['accepted', 'picked_up', 'on_the_way'];

// ============================================================ topshiriq №26

/** Kuryerning bandlik turi — soliq va hujjatlar shunga bog'liq. */
export const EMPLOYMENT_TYPES = ['employee', 'self_employed', 'ip', 'contractor'] as const;

/** Transport yozuvining holati (1a-band). */
export const VEHICLE_STATUSES = ['pending', 'approved', 'rejected', 'archived'] as const;
export const VEHICLE_OWNERS = ['own', 'rented', 'company'] as const;

/** Kuryer hujjatlari (1-band). */
export const COURIER_DOCUMENT_TYPES = [
  'passport',
  'driver_license',
  'vehicle_registration',
  'self_employed_certificate',
  'contract',
  'other',
] as const;
export type CourierDocumentType = (typeof COURIER_DOCUMENT_TYPES)[number];

/**
 * Qaysi transportga qanday hujjat kerak (1-band jadvali).
 * `passport` — doim; `contract` — imzolangan shartnoma skani, u ham doim
 * so'raladi, lekin tasdiqlashni do'kon o'zi hal qiladi.
 */
export function requiredCourierDocuments(opts: {
  vehicle_type?: string | null;
  employment_type?: string | null;
  has_vehicle?: boolean;
}): CourierDocumentType[] {
  const need: CourierDocumentType[] = ['passport'];
  if (['car', 'van', 'truck'].includes(String(opts.vehicle_type))) need.push('driver_license');
  if (opts.has_vehicle ?? ['bike', 'car', 'van', 'truck'].includes(String(opts.vehicle_type))) {
    need.push('vehicle_registration');
  }
  if (opts.employment_type === 'self_employed') need.push('self_employed_certificate');
  return need;
}

/**
 * Transportni haydash uchun kerakli guvohnoma toifasi (1a-band).
 * `foot` va `bike` — guvohnoma talab qilinmaydi.
 */
export const LICENSE_FOR_VEHICLE: Record<string, string | null> = {
  foot: null,
  bike: null,
  car: 'B',
  // 3,5 tonnagacha furgon — B toifasi yetarli
  van: 'B',
  truck: 'C',
};

/** Hodisa turlari (9-band). */
export const INCIDENT_TYPES = ['damage', 'accident', 'theft', 'other'] as const;

/** To'lov usuli (10-band). Fiskal chek sotuvchining zimmasida. */
export const PAYMENT_METHODS = ['cash', 'card_terminal', 'payme', 'click'] as const;

/** Isbot rasmi turlari (2-, 3-, 9-band). Eski yozuvlarda `delivered` / `failed`. */
export const PROOF_KINDS = ['pickup', 'delivery', 'failure', 'signature', 'incident'] as const;
export type ProofKind = (typeof PROOF_KINDS)[number] | 'delivered' | 'failed';

/** Olib ketishda rasm MAJBURIY bo'lgan transportlar (2-band). */
export const PICKUP_PHOTO_REQUIRED_FOR: string[] = ['van', 'truck'];

/** Kuryer hujjati havolasi shuncha vaqt amal qiladi (№16 bilan bir xil). */
export const COURIER_DOC_URL_TTL_MS = 5 * 60 * 1000;
export const COURIER_DOC_MAX_BYTES = 10 * 1024 * 1024;
/** Ishdan ketgandan keyin pasport skani shuncha kun saqlanadi (№16 qoidasi). */
export const COURIER_PASSPORT_RETENTION_DAYS = 30;

/** Imzo — telefonda barmoq bilan chizilgan PNG. */
export const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;

/** Mijoz javob bermay shuncha o'tsa `client_unreachable` ga dalil bo'ladi (4-band). */
export const WAIT_BEFORE_FAIL_MS = 15 * 60 * 1000;
