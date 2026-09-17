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
