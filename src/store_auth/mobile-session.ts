import { createHash, randomBytes } from 'crypto';
import { Op } from 'sequelize';
import { StoreRefreshToken } from './model/store-refresh-token.model';
import { RequestMeta } from './login-journal';

/**
 * Mobil ilova sessiyasi (topshiriq №22, 8-band).
 *
 *   access  — 15 daqiqa (oddiy panel tokeni, faqat muddati qisqa);
 *   refresh — 60 kun, bazada faqat SHA-256 xeshi, HAR ishlatilganda almashadi.
 *
 * Eski (almashtirilgan) refresh token qayta kelsa — bu uni kimdir o'g'irlab
 * ishlatganining belgisi: hisobning BARCHA refresh tokenlari bekor qilinadi,
 * ikkala tomon ham qayta parol bilan kiradi.
 *
 * `token_version` oshsa (parol almashdi, hisob o'chirildi) — refresh ham o'ladi.
 */
export const MOBILE_ACCESS_TTL = process.env.MOBILE_ACCESS_TOKEN_TIME || '15m';
export const MOBILE_REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000;

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');

export async function issueRefreshToken(storeUserId: number, tokenVersion: number, meta: RequestMeta = {}) {
  const raw = randomBytes(48).toString('base64url');
  const row = await StoreRefreshToken.create({
    store_user_id: storeUserId,
    token_hash: hash(raw),
    token_version: tokenVersion,
    expires_at: new Date(Date.now() + MOBILE_REFRESH_TTL_MS),
    ip: meta.ip ? String(meta.ip).slice(0, 64) : null,
    user_agent: meta.userAgent ? String(meta.userAgent).slice(0, 500) : null,
  } as any);
  return { raw, row };
}

export type RefreshLookup =
  | { ok: true; row: StoreRefreshToken }
  | { ok: false; reason: 'unknown' | 'expired' | 'reused' | 'revoked' };

export async function findRefreshToken(raw: string): Promise<RefreshLookup> {
  if (typeof raw !== 'string' || raw.length < 32) return { ok: false, reason: 'unknown' };
  const row = await StoreRefreshToken.findOne({ where: { token_hash: hash(raw) } });
  if (!row) return { ok: false, reason: 'unknown' };
  if (row.revoked_at) {
    // Almashtirilgan token qayta keldi — o'g'irlik belgisi
    if (row.replaced_by_id) {
      await revokeAllRefreshTokens(row.store_user_id);
      return { ok: false, reason: 'reused' };
    }
    return { ok: false, reason: 'revoked' };
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'expired' };
  return { ok: true, row };
}

export async function revokeAllRefreshTokens(storeUserId: number) {
  await StoreRefreshToken.update(
    { revoked_at: new Date() },
    { where: { store_user_id: storeUserId, revoked_at: { [Op.is]: null } } as any },
  );
}

export async function revokeRefreshToken(raw: string) {
  if (typeof raw !== 'string' || !raw) return;
  await StoreRefreshToken.update(
    { revoked_at: new Date() },
    { where: { token_hash: hash(raw), revoked_at: { [Op.is]: null } } as any },
  );
}
