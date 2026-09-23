import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { Op, QueryTypes } from 'sequelize';
import { DeviceToken } from './model/models';

/**
 * Push-bildirishnomalar — FCM HTTP v1 (topshiriq №22, 7-band).
 *
 * Bitta xizmat iOS, Android va PWA (web-push) ni birga qoplaydi.
 *
 * SOZLAMA — ikki usuldan biri (topshiriq №31: kalit repoga yozilmaydi):
 *   1) `FIREBASE_SERVICE_ACCOUNT` — Firebase'dan yuklab olingan servis
 *      hisobi JSON'ining O'ZI (bir qatorga qo'yilgan holda ham bo'ladi);
 *   2) alohida o'zgaruvchilar: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`,
 *      `FCM_PRIVATE_KEY`.
 * Sozlanmagan bo'lsa — hech narsa yuborilmaydi, faqat logga yoziladi.
 *
 * QOIDA: push yuborilmasa asosiy amal BUZILMAYDI. Hamma xato shu yerda yutiladi.
 * `UNREGISTERED` (ilova o'chirilgan) yoki yaroqsiz token — bazadan o'chiriladi.
 */
const logger = new Logger('Push');

const TOKEN_URL = () => process.env.FCM_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const API_BASE = () => process.env.FCM_API_BASE || 'https://fcm.googleapis.com';

let cached: { token: string; exp: number } | null = null;

/**
 * Muhit o'zgaruvchisida kalit bir qatorda bo'ladi: qator tashlash `\n` deb
 * yoziladi. RSA kaliti haqiqiy qator tashlashni talab qiladi.
 */
const unescapeKey = (value: string) => String(value).split('\\n').join('\n');

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Servis hisobi: avval `FIREBASE_SERVICE_ACCOUNT` (JSON), keyin alohida
 * o'zgaruvchilar. `private_key` da qator tashlash matn sifatida kelishi
 * normal — haqiqiy qatorga aylantiriladi (`unescapeKey`).
 */
function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw && raw.trim().startsWith('{')) {
    try {
      const j = JSON.parse(raw);
      if (j.project_id && j.client_email && j.private_key) {
        return {
          projectId: String(j.project_id),
          clientEmail: String(j.client_email),
          privateKey: unescapeKey(j.private_key),
        };
      }
      logger.error("FIREBASE_SERVICE_ACCOUNT ichida project_id/client_email/private_key yo'q");
    } catch {
      logger.error("FIREBASE_SERVICE_ACCOUNT JSON sifatida o'qilmadi");
    }
  }
  const { FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY } = process.env;
  if (FCM_PROJECT_ID && FCM_CLIENT_EMAIL && FCM_PRIVATE_KEY) {
    return {
      projectId: FCM_PROJECT_ID,
      clientEmail: FCM_CLIENT_EMAIL,
      privateKey: unescapeKey(FCM_PRIVATE_KEY),
    };
  }
  return null;
}

const configured = () => serviceAccount() !== null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const sa = serviceAccount();
  if (!sa) throw new Error('FCM sozlanmagan');
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: sa.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: TOKEN_URL(),
      iat: now,
      exp: now + 3600,
    },
    sa.privateKey,
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
  /**
   * Android bildirishnoma kanali (topshiriq №31: Hamkor ilovasida `orders`).
   *
   * ATAYLAB IXTIYORIY: ilovada mavjud bo'lmagan kanal nomi yuborilsa
   * Android bildirishnomani ko'rsatmasligi mumkin. Shuning uchun faqat
   * kanali aniq bilingan ilovalar uchun beriladi.
   */
  channel?: string;
}

async function sendToToken(token: string, msg: PushMessage): Promise<'ok' | 'gone' | 'error'> {
  const sa = serviceAccount();
  const res = await fetch(`${API_BASE()}/v1/projects/${sa?.projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: msg.title, body: msg.body },
        data: Object.fromEntries(Object.entries(msg.data || {}).map(([k, v]) => [k, String(v)])),
        android: {
          // Buyurtma/KP xabari kechikmasin (ilova uxlab yotgan bo'lsa ham)
          priority: 'HIGH',
          ...(msg.channel ? { notification: { channel_id: msg.channel } } : {}),
        },
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
