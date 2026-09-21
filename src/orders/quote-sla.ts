/**
 * KP so'roviga javob muddati — "1 ish kuni" (topshiriq №25, 5-band).
 *
 * Ish vaqti: dushanba–juma, 09:00–18:00 Toshkent (UTC+5, yozgi vaqt yo'q).
 * "1 ish kuni" = 9 ish soati: juma kuni 17:00 da kelgan so'rovga javob
 * dushanba 16:00 gacha kutiladi, shanba–yakshanba sanalmaydi.
 *
 * Adminka shu vaqtdan "24 soat ichida javob bering" sanog'ini chizadi.
 */
const TZ_OFFSET_MS = 5 * 60 * 60 * 1000; // Asia/Tashkent
const WORK_START_H = 9;
const WORK_END_H = 18;
const WORK_DAY_MS = (WORK_END_H - WORK_START_H) * 60 * 60 * 1000;

/** Toshkent vaqtini UTC "niqobi" ostida ko'rsatadi — sana amallari oddiy bo'lsin. */
const toLocal = (d: Date) => new Date(d.getTime() + TZ_OFFSET_MS);
const fromLocal = (d: Date) => new Date(d.getTime() - TZ_OFFSET_MS);

const startOfWorkDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), WORK_START_H, 0, 0, 0));
const endOfWorkDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), WORK_END_H, 0, 0, 0));
const nextDay = (d: Date) => new Date(d.getTime() + 24 * 60 * 60 * 1000);

/** Vaqtni eng yaqin ish oynasiga suradi (dam olish kuni va ish vaqtidan tashqarisi). */
function intoWorkWindow(local: Date): Date {
  let cur = local;
  for (let guard = 0; guard < 14; guard++) {
    const day = cur.getUTCDay(); // 0 — yakshanba, 6 — shanba
    if (day === 0 || day === 6) {
      cur = startOfWorkDay(nextDay(cur));
      continue;
    }
    if (cur.getTime() < startOfWorkDay(cur).getTime()) return startOfWorkDay(cur);
    if (cur.getTime() >= endOfWorkDay(cur).getTime()) {
      cur = startOfWorkDay(nextDay(cur));
      continue;
    }
    return cur;
  }
  return cur;
}

/** So'rov kelgan vaqtdan 1 ish kuni keyin (ISO, UTC). */
export function quoteDueAt(createdAt: Date | string): Date {
  let cur = intoWorkWindow(toLocal(new Date(createdAt)));
  let remaining = WORK_DAY_MS;
  for (let guard = 0; guard < 14 && remaining > 0; guard++) {
    const available = endOfWorkDay(cur).getTime() - cur.getTime();
    if (available >= remaining) {
      cur = new Date(cur.getTime() + remaining);
      remaining = 0;
      break;
    }
    remaining -= available;
    cur = intoWorkWindow(startOfWorkDay(nextDay(cur)));
  }
  return fromLocal(cur);
}

/** Standart amal muddati — bugundan 10 kun (sana, Toshkent bo'yicha). */
export function defaultValidUntil(from: Date = new Date()): string {
  const local = toLocal(from);
  const d = new Date(local.getTime() + 10 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** `valid_until` (YYYY-MM-DD) shu kunning OXIRIGACHA amal qiladi. */
export function isQuoteExpired(validUntil: string | Date, now: Date = new Date()): boolean {
  const day = String(validUntil).slice(0, 10);
  const endOfDayUtc = new Date(`${day}T23:59:59.999+05:00`).getTime();
  return now.getTime() > endOfDayUtc;
}
