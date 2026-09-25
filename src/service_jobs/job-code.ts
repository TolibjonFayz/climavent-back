import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'crypto';

/**
 * Ish isboti kodi (topshiriq №39, 5-band).
 *
 * Yetkazishda (№22) kod SMS bilan ketardi va bazada faqat XESH turardi. Ishda
 * SMS yo'q — kodni mijoz ILOVADA ko'radi (`GET /orders/:id/tracking`, faqat
 * buyurtma egasiga). Demak server uni ochiq holda qayta chiqara olishi kerak:
 * xesh yaramaydi, shuning uchun **AES-256-GCM bilan shifrlanadi**.
 *
 * Kalit muhit sirlaridan hosil qilinadi (`JOB_CODE_KEY` yoki
 * `OTP_HASH_SECRET` / `ACCESS_TOKEN_KEY`) — baza sizib chiqsa ham kodlar
 * ochiq ko'rinmaydi. Format: `v1:<iv>.<tag>.<shifr>` (base64url).
 */
const key = () =>
  createHash('sha256')
    .update(`job-code:${process.env.JOB_CODE_KEY || process.env.OTP_HASH_SECRET || process.env.ACCESS_TOKEN_KEY || ''}`)
    .digest();

export function newJobCode(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}

export function encryptJobCode(code: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(code, 'utf8'), c.final()]);
  return `v1:${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}

/** Ochadi; buzilgan yoki boshqa kalit bilan yozilgan bo'lsa — `null`. */
export function decryptJobCode(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('v1:')) return null;
  try {
    const [iv, tag, enc] = value.slice(3).split('.');
    const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
