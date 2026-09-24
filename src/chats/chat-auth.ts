import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';
import { resolveStoreSession } from 'src/store_auth/store-session';
import { resolveUserSession } from 'src/users/user-session';

/**
 * Chat so'rovchisi (topshiriq №34). REST ham, socket ham shu bilan aniqlanadi —
 * huquq qoidalari bitta joyda.
 *
 *   client — xaridor (sayt/ilova tokeni): faqat o'z suhbatlari;
 *   store  — do'kon admini yoki xodimi: faqat o'z do'koni suhbatlari.
 *            `perms: null` — do'kon admini (cheklovsiz), aks holda xodim
 *            ruxsatlari (№35: `chat.view`, `chat.reply`);
 *   super  — superadmin / servis kaliti: barcha suhbatlarni FAQAT o'qiydi.
 * Kuryer — chatga kirmaydi.
 */
export type ChatActor =
  | { kind: 'client'; user_id: number }
  | { kind: 'store'; store_id: number; store_user_id: number; perms: Set<string> | null }
  | { kind: 'super' };

export const isServiceKey = (provided: unknown): boolean => {
  const expected = process.env.SERVICE_API_KEY;
  if (!expected || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** `null` — token yaroqsiz yoki bu hisob chatga kira olmaydi. */
export async function resolveChatActor(jwt: JwtService, token: string | null | undefined): Promise<ChatActor | null> {
  const raw = String(token || '').replace(/^Bearer\s+/i, '').trim();
  if (!raw) return null;
  try {
    const p = await jwt.verifyAsync(raw, { secret: process.env.STORE_TOKEN_KEY || process.env.ACCESS_TOKEN_KEY });
    const s = await resolveStoreSession(p);
    if (s) {
      if (s.role === 'superadmin') return { kind: 'super' };
      if (s.role === 'store_admin' && s.store_id && s.user_id) {
        return {
          kind: 'store',
          store_id: Number(s.store_id),
          store_user_id: Number(s.user_id),
          perms: s.staff ? new Set(s.staff.permissions) : null,
        };
      }
      return null; // kuryer
    }
  } catch {
    /* xaridor tokeni sinaladi */
  }
  try {
    const p = await jwt.verifyAsync(raw, { secret: process.env.ACCESS_TOKEN_KEY_USER });
    const u = await resolveUserSession(p);
    if (u) return { kind: 'client', user_id: u.id };
  } catch {
    /* pastda */
  }
  return null;
}

/** Do'kon tomonining ruxsati (admin — hammasi; xodim — rolidagi kodlar). */
export const storeCan = (a: ChatActor, perm: 'chat.view' | 'chat.reply' | 'orders.view' | 'carts.view') =>
  a.kind === 'store' && (a.perms === null || a.perms.has(perm));

/**
 * Buyurtma signalini (`order_updated`, №36) olishi mumkinmi: buyurtmalar
 * yoki KP (savatlar) ro'yxatini ko'radigan hisob — REST dagi
 * `GET /orders/all` ruxsati bilan bir xil (`staff-permissions.ts`).
 */
export const storeSeesOrders = (a: ChatActor) => storeCan(a, 'orders.view') || storeCan(a, 'carts.view');
