import { Logger } from '@nestjs/common';
import { createPrivateKey } from 'crypto';
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
 *      hisobi JSON'ining O'ZI (bir qatorga qo'yilgan holda ham bo'ladi;
 *      qo'shtirnoqqa o'ralgan yoki base64 bo'lsa ham o'qiladi);
 *   2) alohida o'zgaruvchilar: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`,
 *      `FCM_PRIVATE_KEY`.
 * Sozlanmagan bo'lsa — hech narsa yuborilmaydi, faqat logga yoziladi.
 *
 * KO'RINUVCHANLIK (topshiriq №32): har urinish — qabul qiluvchi topilmasa
 * ham — logda BITTA qator bilan chiqadi (`Push: ... — N ta qurilma topildi,
 * K ta yuborildi`). Ishga tushganda FCM holati bir qatorda yoziladi,
 * `/api/health` da `fcm` maydoni bor.
 *
 * QOIDA: push yuborilmasa asosiy amal BUZILMAYDI. Hamma xato shu yerda yutiladi.
 * `UNREGISTERED` (ilova o'chirilgan) yoki yaroqsiz token — bazadan o'chiriladi.
 */
const logger = new Logger('Push');

const TOKEN_URL = () => process.env.FCM_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const API_BASE = () => process.env.FCM_API_BASE || 'https://fcm.googleapis.com';
/** Google javob bermasa so'rov (va u bilan buyurtma) osilib qolmasin. */
const HTTP_TIMEOUT_MS = 10_000;

let cached: { token: string; exp: number } | null = null;

/** Oxirgi OAuth urinishi — `/api/health` va sinov endpointi uchun. */
let lastAuth: { ok: boolean; at: string; error?: string } | null = null;

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

type Parsed = { sa: ServiceAccount; reason: null } | { sa: null; reason: string };

/**
 * `FIREBASE_SERVICE_ACCOUNT` ni JSON obyektga aylantiradi.
 *
 * Railway'da qiymat ko'pincha qo'shtirnoqqa o'ralib qoladi yoki base64
 * qilib qo'yiladi — ikkalasi ham qabul qilinadi. Xato matnida kalitning
 * BIRORTA bo'lagi chiqmaydi (JSON.parse xabari Node 20+ da parchani
 * ko'rsatadi — shuning uchun faqat pozitsiya olinadi).
 */
function parseServiceAccountJson(raw: string): { json: any } | { error: string } {
  let text = raw.trim();
  if (
    text.length > 1 &&
    ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"')))
  ) {
    if (text.startsWith('"')) {
      // JSON satr ichidagi JSON ("{\"type\": ...}")
      try {
        const inner = JSON.parse(text);
        if (typeof inner === 'string') text = inner.trim();
      } catch {
        text = text.slice(1, -1).trim();
      }
    } else {
      text = text.slice(1, -1).trim();
    }
  }
  if (!text.startsWith('{') && /^[A-Za-z0-9+/=\s]+$/.test(text)) {
    const decoded = Buffer.from(text, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{')) text = decoded;
  }
  if (!text.startsWith('{')) {
    return { error: `JSON emas (qiymat "{" bilan boshlanmaydi, uzunligi ${raw.length})` };
  }
  try {
    return { json: JSON.parse(text) };
  } catch (e) {
    const pos = /position (\d+)/.exec(String((e as Error).message))?.[1];
    return { error: `JSON sifatida o'qilmadi${pos ? ` (${pos}-belgida xato)` : ''}` };
  }
}

function validKey(privateKey: string): string | null {
  try {
    createPrivateKey(privateKey);
    return null;
  } catch {
    return "private_key PEM kalit sifatida o'qilmadi (\\n qator tashlashlari buzilgan bo'lishi mumkin)";
  }
}

function parseEnv(): Parsed {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw && raw.trim()) {
    const r = parseServiceAccountJson(raw);
    if ('error' in r) return { sa: null, reason: r.error };
    const j = r.json || {};
    const missing = ['project_id', 'client_email', 'private_key'].filter((k) => !j[k]);
    if (missing.length) return { sa: null, reason: `JSON ichida yo'q: ${missing.join(', ')}` };
    const privateKey = unescapeKey(j.private_key);
    const bad = validKey(privateKey);
    if (bad) return { sa: null, reason: bad };
    return {
      sa: { projectId: String(j.project_id), clientEmail: String(j.client_email), privateKey },
      reason: null,
    };
  }
  const { FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY } = process.env;
  if (FCM_PROJECT_ID || FCM_CLIENT_EMAIL || FCM_PRIVATE_KEY) {
    const missing = ['FCM_PROJECT_ID', 'FCM_CLIENT_EMAIL', 'FCM_PRIVATE_KEY'].filter((k) => !process.env[k]);
    if (missing.length) return { sa: null, reason: `yo'q: ${missing.join(', ')}` };
    const privateKey = unescapeKey(FCM_PRIVATE_KEY);
    const bad = validKey(privateKey);
    if (bad) return { sa: null, reason: bad };
    return { sa: { projectId: FCM_PROJECT_ID, clientEmail: FCM_CLIENT_EMAIL, privateKey }, reason: null };
  }
  return { sa: null, reason: "o'zgaruvchi o'rnatilmagan" };
}

/** Muhit o'zgarmaguncha qayta o'qilmaydi (RSA kalitini har safar tekshirmaslik uchun). */
let parsedFor: string | null = null;
let parsed: Parsed | null = null;

function readServiceAccount(): Parsed {
  const fingerprint = [
    process.env.FIREBASE_SERVICE_ACCOUNT,
    process.env.FCM_PROJECT_ID,
    process.env.FCM_CLIENT_EMAIL,
    process.env.FCM_PRIVATE_KEY,
  ].join('\u0000');
  if (parsed === null || parsedFor !== fingerprint) {
    parsed = parseEnv();
    parsedFor = fingerprint;
  }
  return parsed;
}

const serviceAccount = () => readServiceAccount().sa;
const configured = () => serviceAccount() !== null;

/** Tashqariga ko'rsatiladigan holat — kalitning o'zi emas. */
export function fcmStatus(): {
  fcm: 'ok' | 'sozlanmagan';
  project_id: string | null;
  reason: string | null;
  auth: { ok: boolean; at: string; error?: string } | null;
} {
  const p = readServiceAccount();
  return {
    fcm: p.sa ? 'ok' : 'sozlanmagan',
    project_id: p.sa?.projectId ?? null,
    reason: p.reason,
    auth: lastAuth,
  };
}

/**
 * Ishga tushganda bitta qator (topshiriq №32, 2-band). Kalit o'qilsa, Google
 * OAuth ham darhol sinab ko'riladi — kalit bekor qilingan / boshqa loyihaniki
 * bo'lsa buyurtma kutmasdan logda ko'rinadi.
 */
export function logFcmStatus() {
  const p = readServiceAccount();
  if (!p.sa) {
    logger.warn(`FCM sozlanmagan — FIREBASE_SERVICE_ACCOUNT o'qilmadi: ${p.reason}`);
    return;
  }
  logger.log(`FCM tayyor (project_id=${p.sa.projectId})`);
  accessToken()
    .then(() => logger.log(`FCM OAuth tekshiruvi: ok (${p.sa!.clientEmail})`))
    .catch((e) => logger.error(`FCM OAuth tekshiruvi: XATO — ${(e as Error).message}`));
}

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const sa = serviceAccount();
  if (!sa) throw new Error('FCM sozlanmagan');
  try {
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
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Google javobi: {"error":"invalid_grant","error_description":"..."} — sir yo'q
      const body: any = await res.json().catch(() => ({}));
      const detail = [body.error, body.error_description].filter(Boolean).join(': ');
      throw new Error(`FCM OAuth ${res.status}${detail ? ` ${detail}` : ''}`);
    }
    const data: any = await res.json();
    cached = { token: data.access_token, exp: Date.now() + Number(data.expires_in || 3600) * 1000 };
    lastAuth = { ok: true, at: new Date().toISOString() };
    return cached.token;
  } catch (e) {
    const message = /^FCM /.test((e as Error).message) ? (e as Error).message : `FCM OAuth: ${netError(e)}`;
    lastAuth = { ok: false, at: new Date().toISOString(), error: message };
    throw new Error(message);
  }
}

/** `fetch failed` o'zi hech narsa demaydi — asl sababi (`ECONNREFUSED`, timeout) qo'shiladi. */
function netError(e: unknown): string {
  const err = e as Error & { cause?: { code?: string; message?: string } };
  const cause = err?.cause?.code || err?.cause?.message;
  return `${err?.message || String(e)}${cause ? ` (${cause})` : ''}`;
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
  /**
   * Android `tag` (topshiriq №34: `chat-<id>`) — bir suhbatning ketma-ket
   * xabarlari bitta bildirishnomaga yig'iladi (yangisi eskisini almashtiradi).
   */
  tag?: string;
}

type SendOutcome = { status: 'ok' } | { status: 'gone' | 'error'; error: string };

/**
 * `INVALID_ARGUMENT` faqat TOKEN yaroqsiz bo'lsa "gone" — xabar tanasidagi
 * xato (masalan noto'g'ri maydon) ham shu kod bilan keladi va bunda
 * HAQIQIY tokenlarni o'chirib yubormaslik kerak.
 */
function isGone(status: number, code: string, message: string): boolean {
  if (status === 404 || code === 'UNREGISTERED' || /registration-token-not-registered/.test(message)) return true;
  return code === 'INVALID_ARGUMENT' && /registration token/i.test(message);
}

async function sendToToken(token: string, msg: PushMessage): Promise<SendOutcome> {
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
          ...(msg.channel || msg.tag
            ? {
                notification: {
                  ...(msg.channel ? { channel_id: msg.channel } : {}),
                  ...(msg.tag ? { tag: msg.tag } : {}),
                },
              }
            : {}),
        },
      },
    }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (res.ok) return { status: 'ok' };
  const text = await res.text().catch(() => '');
  let code = '';
  let message = text.slice(0, 200);
  try {
    const err = JSON.parse(text)?.error || {};
    // FCM aniq sababi details[].errorCode da: SENDER_ID_MISMATCH, THIRD_PARTY_AUTH_ERROR, ...
    const fcmCode = (err.details || []).map((d: any) => d?.errorCode).find(Boolean);
    code = String(fcmCode || err.status || '');
    message = String(err.message || message).slice(0, 200);
  } catch {
    /* matn JSON emas */
  }
  const error = `FCM ${res.status}${code ? ` ${code}` : ''}: ${message}`;
  return { status: isGone(res.status, code, message) ? 'gone' : 'error', error };
}

export interface PushResult {
  tokens_found: number;
  sent: number;
  failed: number;
  /** Eskirgan (ilova o'chirilgan) tokenlar — bazadan o'chirildi. */
  removed: number;
  errors: string[];
  /** FCM sozlanmagan — urinilmadi. */
  not_configured: boolean;
}

export const emptyPushResult = (): PushResult => ({
  tokens_found: 0,
  sent: 0,
  failed: 0,
  removed: 0,
  errors: [],
  not_configured: false,
});

/** Bir nechta `pushTo` natijasini qo'shadi (tillar bo'yicha guruhlar). */
export function mergeResults(a: PushResult, b: PushResult): PushResult {
  return {
    tokens_found: a.tokens_found + b.tokens_found,
    sent: a.sent + b.sent,
    failed: a.failed + b.failed,
    removed: a.removed + b.removed,
    errors: [...a.errors, ...b.errors],
    not_configured: a.not_configured || b.not_configured,
  };
}

/**
 * Har urinish uchun BITTA qator (topshiriq №32, 1-band):
 *   Push: buyurtma #116, do'kon 2 (new_order, hisob 48) — 1 ta qurilma topildi, 1 ta yuborildi
 *   Push: buyurtma #117, do'kon 1 (new_order, hisob 49) — 0 ta qurilma topildi, yuborilmadi
 *   Push sozlanmagan — yuborilmadi: "Yangi buyurtma #116" (buyurtma #116, do'kon 1 — 1 ta qurilma)
 */
export function logPush(label: string, title: string, r: PushResult) {
  if (r.not_configured) {
    const reason = readServiceAccount().reason;
    logger.warn(
      `Push sozlanmagan — yuborilmadi: "${title}" (${label} — ${r.tokens_found} ta qurilma)` +
        (reason ? `; sabab: ${reason}` : ''),
    );
    return;
  }
  if (!r.tokens_found) {
    logger.log(`Push: ${label} — 0 ta qurilma topildi, yuborilmadi`);
    return;
  }
  const parts = [`${r.tokens_found} ta qurilma topildi`, `${r.sent} ta yuborildi`];
  if (r.failed) parts.push(`${r.failed} ta xato`);
  if (r.removed) parts.push(`${r.removed} ta eskirgan token o'chirildi`);
  const line = `Push: ${label} — ${parts.join(', ')}`;
  if (r.failed) logger.warn(`${line}: ${[...new Set(r.errors)].join(' | ')}`);
  else logger.log(line);
}

function defaultLabel(ownerType: 'store_user' | 'user', ids: number[], msg: PushMessage) {
  const who = `${ownerType === 'user' ? 'xaridor' : 'hisob'} ${ids.join(',') || '-'}`;
  const order = msg.data?.order_id ? `buyurtma #${msg.data.order_id}, ` : '';
  const type = msg.data?.type ? ` (${msg.data.type})` : '';
  return `${order}${who}${type}`;
}

/**
 * Egasiga tegishli barcha qurilmalarga. Hech qachon xato tashlamaydi.
 *
 * `opts.quiet` — log chaqiruvchida (bir nechta guruhni bitta qatorga
 * yig'ish uchun, `logPush`).
 */
export async function pushTo(
  ownerType: 'store_user' | 'user',
  ownerIds: number[],
  msg: PushMessage,
  opts: { label?: string; quiet?: boolean } = {},
): Promise<PushResult> {
  const result = emptyPushResult();
  const ids = [...new Set((ownerIds || []).filter((x) => Number.isInteger(x) && x > 0))];
  try {
    const tokens = ids.length
      ? await DeviceToken.findAll({ where: { owner_type: ownerType, owner_id: { [Op.in]: ids } } })
      : [];
    result.tokens_found = tokens.length;
    if (!configured()) {
      result.not_configured = true;
    } else {
      for (const t of tokens) {
        try {
          const r = await sendToToken(t.token, msg);
          if (r.status === 'ok') {
            result.sent++;
            await t.update({ last_used_at: new Date() });
          } else if (r.status === 'gone') {
            result.removed++;
            await t.destroy();
          } else {
            result.failed++;
            result.errors.push(r.error);
          }
        } catch (e) {
          result.failed++;
          const message = (e as Error).message;
          result.errors.push(/^FCM /.test(message) ? message : `FCM so'rovi: ${netError(e)}`);
        }
      }
    }
  } catch (e) {
    result.errors.push(`yiqildi: ${(e as Error).message}`);
    logger.error(`Push yiqildi (${opts.label || defaultLabel(ownerType, ids, msg)}): ${(e as Error).message}`);
  }
  if (!opts.quiet) logPush(opts.label || defaultLabel(ownerType, ids, msg), msg.title, result);
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
    const owners = rows.map((r) => Number(r.id));
    const type = msg.data?.type ? `${msg.data.type}, ` : '';
    await pushTo('store_user', owners, msg, {
      label: `do'kon ${ids.join(',')} (${type}hisob ${owners.join(',') || "yo'q"})`,
    });
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
    const type = msg.data?.type ? ` (${msg.data.type})` : '';
    await pushTo('store_user', rows[0] ? [Number(rows[0].store_user_id)] : [], msg, {
      label: `kuryer #${courierId}${type}`,
    });
  } catch (e) {
    logger.error(`Push (kuryer) yiqildi: ${(e as Error).message}`);
  }
}
