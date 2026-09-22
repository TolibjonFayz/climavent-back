import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { Op, QueryTypes } from 'sequelize';
import { UserRefreshToken } from './model/user-refresh-token.model';

/**
 * XARIDOR MOBIL SESSIYASI (topshiriq №29, 3-band).
 *
 * Egasining talabi: ilovadan faol foydalanayotgan xaridor HECH QACHON
 * chiqarib yuborilmasin — qayta SMS faqat 90 kundan ortiq ilovani
 * ochmaganda. Shuning uchun muddat SIRPANUVCHI: har yangilashda 90 kun
 * qaytadan boshlanadi ("oxirgi foydalanishdan", oxirgi kirishdan emas).
 *
 * Bekor bo'lish sabablari FAQAT shular:
 *   - 90 kun ishlatilmadi (`expires_at`);
 *   - foydalanuvchi o'zi chiqdi (`users/signout`);
 *   - eski (almashtirilgan) refresh qayta ishlatildi — o'g'irlik belgisi,
 *     butun zanjir bekor;
 *   - admin hisobni bloklagan yoki telefon almashgan (`token_version`).
 */
export const MOBILE_ACCESS_TTL = process.env.MOBILE_ACCESS_TOKEN_TIME_USER || '15m';
/** Sayt access tokeni — qisqa. Sessiya refresh bilan cho'ziladi. */
export const WEB_ACCESS_TTL = process.env.WEB_ACCESS_TOKEN_TIME_USER || '30m';
/** Mobil: 90 kun (topshiriq №29). Sayt: 180 kun = 6 oy. Ikkisi ham sirpanuvchi. */
export const MOBILE_REFRESH_DAYS = Number(process.env.MOBILE_REFRESH_DAYS_USER || 90);
export const WEB_REFRESH_DAYS = Number(process.env.WEB_REFRESH_DAYS_USER || 180);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Almashtirilgan refresh shu muddat ichida qayta kelsa — o'g'irlik emas,
 * tarmoq uzilishi deb qaraladi va AYNAN o'sha yangi juftlik qaytariladi.
 */
export const REFRESH_GRACE_MS = Number(process.env.MOBILE_REFRESH_GRACE_MS || 30_000);

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');

/**
 * Imtiyoz oynasi uchun shifr kaliti. Bazaga tokenning O'ZI yozilmasligi
 * qoidasi saqlanadi: yozilgani — ilova kaliti bilan shifrlangan nusxa va u
 * 30 soniyadan keyin tozalanadi.
 */
const graceKey = () =>
  createHash('sha256')
    .update(`refresh-grace:${process.env.REFRESH_TOKEN_KEY_USER || process.env.ACCESS_TOKEN_KEY_USER || ''}`)
    .digest();

function seal(raw: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', graceKey(), iv);
  const enc = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), enc.toString('hex')].join('.');
}

function open(sealed: string | null): string | null {
  if (!sealed) return null;
  try {
    const [iv, tag, data] = sealed.split('.');
    const decipher = createDecipheriv('aes-256-gcm', graceKey(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export async function issueUserRefreshToken(
  userId: number,
  tokenVersion: number,
  meta: SessionMeta = {},
  ttlDays: number = WEB_REFRESH_DAYS,
) {
  const raw = randomBytes(48).toString('base64url');
  const row = await UserRefreshToken.create({
    user_id: userId,
    token_hash: hash(raw),
    token_version: tokenVersion,
    ttl_days: ttlDays,
    expires_at: new Date(Date.now() + ttlDays * DAY_MS),
    ip: meta.ip ? String(meta.ip).slice(0, 64) : null,
    user_agent: meta.userAgent ? String(meta.userAgent).slice(0, 500) : null,
  } as any);
  return { raw, row };
}

export type UserRefreshLookup =
  | { ok: true; row: UserRefreshToken }
  /** Imtiyoz oynasi: xuddi o'sha yangi juftlikni qaytarish kerak. */
  | { ok: 'grace'; row: UserRefreshToken; replacement: string }
  | { ok: false; reason: 'unknown' | 'expired' | 'reused' | 'revoked' };

export async function findUserRefreshToken(raw: string): Promise<UserRefreshLookup> {
  if (typeof raw !== 'string' || raw.length < 32) return { ok: false, reason: 'unknown' };
  const row = await UserRefreshToken.findOne({ where: { token_hash: hash(raw) } });
  if (!row) return { ok: false, reason: 'unknown' };
  if (row.revoked_at) {
    if (row.replaced_by_id) {
      const graceOchiq =
        row.replaced_at && Date.now() - new Date(row.replaced_at).getTime() <= REFRESH_GRACE_MS;
      const replacement = graceOchiq ? open(row.replacement_enc) : null;
      if (replacement) return { ok: 'grace', row, replacement };
      // Almashtirilgan token oynadan keyin qayta keldi — o'g'irlik belgisi
      await revokeAllUserRefreshTokens(row.user_id);
      return { ok: false, reason: 'reused' };
    }
    return { ok: false, reason: 'revoked' };
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'expired' };
  return { ok: true, row };
}

/**
 * Tokenni ALMASHTIRISH. Shartli `UPDATE` — bir token bilan ikki so'rov
 * bir vaqtda kelsa faqat bittasi o'tadi, ikkinchisi imtiyoz oynasidan
 * o'sha juftlikni oladi.
 */
export async function rotateUserRefreshToken(
  row: UserRefreshToken,
  tokenVersion: number,
  meta: SessionMeta = {},
): Promise<{ raw: string; row: UserRefreshToken } | null> {
  const sequelize = UserRefreshToken.sequelize;

  // SIRPANUVCHI muddat: yangi token shu sessiyaning muddati bilan (sayt 180
  // kun, mobil 90) qaytadan boshlanadi — faol foydalanuvchi hech qachon
  // chiqarib yuborilmaydi.
  //
  // TARTIB MUHIM: avval YANGI qator yaratiladi, keyin eskisi BITTA
  // `UPDATE` bilan "bekor + almashtirildi + shifrlangan nusxa" holatiga
  // o'tadi. Ilgari ikki qadamda edi va o'rtada eski token "bekor, lekin
  // almashtirilmagan" ko'rinardi: shu mikro-oynada kelgan PARALLEL so'rov
  // imtiyoz oynasini topmay 401 olardi (sayt profil sahifasida aynan
  // shunday bo'ldi — bir vaqtda 4 ta so'rov 401 oladi).
  const next = await issueUserRefreshToken(
    row.user_id,
    tokenVersion,
    meta,
    Number(row.ttl_days) || WEB_REFRESH_DAYS,
  );
  const [, affected]: any = await sequelize.query(
    `UPDATE user_refresh_tokens
        SET revoked_at = now(), replaced_at = now(), replaced_by_id = :next,
            replacement_enc = :enc, last_used_at = now()
      WHERE id = :id AND revoked_at IS NULL`,
    { replacements: { id: row.id, next: next.row.id, enc: seal(next.raw) }, type: QueryTypes.UPDATE },
  );
  if (!affected) {
    // Bizdan oldin boshqa so'rov almashtirgan — o'zimiz yaratgan qatorni
    // qoldirmaymiz (hech kimga berilmagan, "yetim" sessiya bo'lib qolardi).
    await UserRefreshToken.destroy({ where: { id: next.row.id } });
    return null;
  }
  // Oynasi o'tgan nusxalarni tozalaymiz: shifrlangan token bazada
  // kerakdan uzoq turmasin.
  await sequelize.query(
    `UPDATE user_refresh_tokens
        SET replacement_enc = NULL
      WHERE user_id = :user AND replacement_enc IS NOT NULL
        AND replaced_at < now() - (:grace || ' milliseconds')::interval`,
    {
      replacements: { user: row.user_id, grace: String(REFRESH_GRACE_MS) },
      type: QueryTypes.UPDATE,
    },
  );
  return next;
}

export async function revokeAllUserRefreshTokens(userId: number) {
  await UserRefreshToken.update(
    { revoked_at: new Date(), replacement_enc: null },
    { where: { user_id: userId, revoked_at: { [Op.is]: null } } as any },
  );
}

/** Bitta qurilmadan chiqish (`users/signout`). */
export async function revokeUserRefreshToken(raw: string): Promise<boolean> {
  if (typeof raw !== 'string' || !raw) return false;
  const [affected] = await UserRefreshToken.update(
    { revoked_at: new Date(), replacement_enc: null },
    { where: { token_hash: hash(raw), revoked_at: { [Op.is]: null } } as any },
  );
  return affected > 0;
}
