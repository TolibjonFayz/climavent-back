import { timingSafeEqual } from 'crypto';

/**
 * SERVIS KALITI (`X-API-Key`) — YAGONA TEKSHIRUV (audit 2026-11-05, 11-band).
 *
 * Ilgari 7 joyda bir xil kod: faqat bitta `SERVICE_API_KEY`. Uni almashtirish
 * uchun BARCHA botlar va skriptlarni bir vaqtda yangilash kerak edi (aks holda
 * uzilish) — shuning uchun kalit 22.09 dan beri almashtirilmagan.
 *
 * Endi qo'shimcha kalitlar `SERVICE_API_KEYS` da (vergul bilan), ixtiyoriy
 * nom bilan: `jihozvent_bot:abc...,kp_bot:def...`. Tartib:
 *   1) har bir botga yangi alohida kalit `SERVICE_API_KEYS` ga qo'shiladi;
 *   2) botlar birin-ketin yangi kalitga o'tkaziladi;
 *   3) eski `SERVICE_API_KEY` o'chiriladi — hech narsa uzilmaydi.
 * Bitta bot kaliti sizsa — faqat o'shani olib tashlash kifoya.
 *
 * `SERVICE_API_KEYS` bo'lmasa xatti-harakat AVVALGIDEK (faqat SERVICE_API_KEY).
 * Huquq hamma kalitda bir xil (superadmin) — endpoint bo'yicha cheklash
 * keyingi bosqich.
 */

type Entry = { label: string; key: Buffer };

const MIN_LEN = 16; // qisqa/bo'sh qiymat tasodifan kalit bo'lib qolmasin

let cacheSrc: string | null = null;
let cache: Entry[] = [];

const entries = (): Entry[] => {
  const src = `${process.env.SERVICE_API_KEY || ''}\u0000${process.env.SERVICE_API_KEYS || ''}`;
  if (src === cacheSrc) return cache;
  const list: Entry[] = [];
  const main = String(process.env.SERVICE_API_KEY || '').trim();
  if (main) list.push({ label: 'default', key: Buffer.from(main) });
  for (const raw of String(process.env.SERVICE_API_KEYS || '').split(',')) {
    const item = raw.trim();
    if (!item) continue;
    const i = item.indexOf(':');
    // "nom:kalit" — nom faqat harf/raqam/_/-; aks holda butun qiymat kalit
    const named = i > 0 && /^[A-Za-z0-9_-]{1,40}$/.test(item.slice(0, i));
    const label = named ? item.slice(0, i) : `key${list.length}`;
    const key = named ? item.slice(i + 1).trim() : item;
    if (key.length >= MIN_LEN) list.push({ label, key: Buffer.from(key) });
  }
  cacheSrc = src;
  cache = list;
  return list;
};

/** Mos kalit nomi (`default`, `jihozvent_bot`, ...) yoki `null`. */
export function matchServiceKey(provided: unknown): string | null {
  if (typeof provided !== 'string' || !provided) return null;
  const a = Buffer.from(provided);
  let found: string | null = null;
  // Barcha kalitlar tekshiriladi (birinchi mosda to'xtamaydi) — vaqt farqi
  // qaysi kalit ekanini sezdirmasin. Uzunlik oldin: timingSafeEqual talabi.
  for (const e of entries()) {
    if (a.length === e.key.length && timingSafeEqual(a, e.key) && !found) found = e.label;
  }
  return found;
}

export const isServiceKey = (provided: unknown): boolean => matchServiceKey(provided) !== null;
