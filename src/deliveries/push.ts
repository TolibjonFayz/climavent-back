import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { Op, QueryTypes } from 'sequelize';
import { DeviceToken } from './model/models';

/**
 * Push-bildirishnomalar — FCM HTTP v1 (topshiriq №22, 7-band).
 *
 * Bitta xizmat iOS, Android va PWA (web-push) ni birga qoplaydi. Sozlama:
 *   FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY  (servis hisobi kaliti)
 * Sozlanmagan bo'lsa — hech narsa yuborilmaydi, faqat logga yoziladi.
 *
 * QOIDA: push yuborilmasa asosiy amal BUZILMAYDI. Hamma xato shu yerda yutiladi.
 * `UNREGISTERED` (ilova o'chirilgan) yoki yaroqsiz token — bazadan o'chiriladi.
 */
const logger = new Logger('Push');

const TOKEN_URL = () => process.env.FCM_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const API_BASE = () => process.env.FCM_API_BASE || 'https://fcm.googleapis.com';

let cached: { token: string; exp: number } | null = null;

const configured = () =>
  Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY);

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: process.env.FCM_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: TOKEN_URL(),
      iat: now,
      exp: now + 3600,
    },
    String(process.env.FCM_PRIVATE_KEY).replace(/\\n/g, '\n'),
    { algorithm: 'RS256' },
  );
  const res = await fetch(TOKEN_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`FCM token: ${res.status}`);
  const data: any = await res.json();
  cached = { token: data.access_token, exp: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return cached.token;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Ilova ichida qaysi ekranni ochish (hammasi satr bo'lishi shart — FCM talabi). */
  data?: Record<string, string | number>;
}

async function sendToToken(token: string, msg: PushMessage): Promise<'ok' | 'gone' | 'error'> {
  const res = await fetch(`${API_BASE()}/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: msg.title, body: msg.body },
        data: Object.fromEntries(Object.entries(msg.data || {}).map(([k, v]) => [k, String(v)])),
      },
    }),
  });
  if (res.ok) return 'ok';
  const text = await res.text().catch(() => '');
  if (res.status === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/.test(text)) return 'gone';
  logger.warn(`FCM ${res.status}: ${text.slice(0, 200)}`);
  return 'error';
}

/** Egasiga tegishli barcha qurilmalarga. Hech qachon xato tashlamaydi. */
export async function pushTo(
  ownerType: 'store_user' | 'user',
  ownerIds: number[],
  msg: PushMessage,
): Promise<{ sent: number; removed: number }> {
  const result = { sent: 0, removed: 0 };
  try {
    const ids = [...new Set(ownerIds.filter((x) => Number.isInteger(x) && x > 0))];
    if (!ids.length) return result;
    const tokens = await DeviceToken.findAll({ where: { owner_type: ownerType, owner_id: { [Op.in]: ids } } });
    if (!tokens.length) return result;
    if (!configured()) {
      logger.log(`Push sozlanmagan — yuborilmadi: "${msg.title}" (${tokens.length} qurilma)`);
      return result;
    }
    for (const t of tokens) {
      try {
        const r = await sendToToken(t.token, msg);
        if (r === 'ok') {
          result.sent++;
          await t.update({ last_used_at: new Date() });
        } else if (r === 'gone') {
          result.removed++;
          await t.destroy();
        }
      } catch (e) {
        logger.warn(`Push xatosi: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    logger.error(`Push yiqildi: ${(e as Error).message}`);
  }
  return result;
}

/** Do'kon adminlari (faol store_admin hisoblari). */
export async function pushToStoreAdmins(storeIds: number[], msg: PushMessage) {
  try {
    const ids = [...new Set(storeIds.filter(Boolean))];
    if (!ids.length) return;
    const rows: any[] = await DeviceToken.sequelize.query(
      `SELECT id FROM store_users WHERE role = 'store_admin' AND is_active AND store_id IN (:ids)`,
      { replacements: { ids }, type: QueryTypes.SELECT },
    );
    await pushTo('store_user', rows.map((r) => r.id), msg);
  } catch (e) {
    logger.error(`Push (do'kon adminlari) yiqildi: ${(e as Error).message}`);
  }
}

/** Kuryer (profil id bo'yicha). */
export async function pushToCourier(courierId: number | null | undefined, msg: PushMessage) {
  try {
    if (!courierId) return;
    const rows: any[] = await DeviceToken.sequelize.query('SELECT store_user_id FROM couriers WHERE id = :id', {
      replacements: { id: courierId },
      type: QueryTypes.SELECT,
    });
    if (rows[0]) await pushTo('store_user', [rows[0].store_user_id], msg);
  } catch (e) {
    logger.error(`Push (kuryer) yiqildi: ${(e as Error).message}`);
  }
}
