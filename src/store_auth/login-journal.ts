import { Logger } from '@nestjs/common';
import { Op } from 'sequelize';
import { LoginEvent, StoreUserLogin } from './model/store-user-login.model';

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

const logger = new Logger('LoginJournal');

/** 12 oy (maxfiylik siyosatiga shunday yoziladi — topshiriq №21, 2-band). */
export const LOGIN_JOURNAL_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export const metaOf = (req: any): RequestMeta => ({
  ip: req?.ip ?? null,
  userAgent: typeof req?.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : null,
});

/**
 * Jurnalga yozadi. Jurnal yozilmasa asosiy amal (kirish, parol) BUZILMAYDI —
 * xato faqat logga tushadi.
 */
export async function journal(
  event: LoginEvent,
  who: { store_user_id?: number | null; login?: string | null },
  meta: RequestMeta = {},
): Promise<void> {
  try {
    await StoreUserLogin.create({
      event,
      store_user_id: who.store_user_id ?? null,
      login: typeof who.login === 'string' ? who.login.slice(0, 100) : null,
      ip: meta.ip ? String(meta.ip).slice(0, 64) : null,
      user_agent: meta.userAgent ? String(meta.userAgent).slice(0, 500) : null,
      created_at: new Date(),
    } as any);
  } catch (e) {
    logger.error(`Kirish jurnaliga yozilmadi (${event}): ${(e as Error).message}`);
  }
}

export async function recentFailures(storeUserId: number, event: LoginEvent, windowMs: number) {
  return StoreUserLogin.count({
    where: { store_user_id: storeUserId, event, created_at: { [Op.gt]: new Date(Date.now() - windowMs) } },
  });
}

export async function listLogins(storeUserId: number, limit?: number) {
  const n = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const rows = await StoreUserLogin.findAll({
    where: { store_user_id: storeUserId },
    attributes: ['event', 'ip', 'user_agent', 'created_at'],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    limit: n,
  });
  return rows.map((r) => ({ event: r.event, ip: r.ip, user_agent: r.user_agent, created_at: r.created_at }));
}

export async function purgeOldLogins(): Promise<number> {
  return StoreUserLogin.destroy({
    where: { created_at: { [Op.lt]: new Date(Date.now() - LOGIN_JOURNAL_RETENTION_MS) } },
  });
}
