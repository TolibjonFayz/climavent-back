import { Logger } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { DeviceToken } from './model/models';
import { pushTo, PushMessage } from './push';

/**
 * XARIDORGA PUSH (topshiriq №29, 4-band).
 *
 * SMS faqat ikkita hodisada ketadi (yo'lda + kod, KP tayyor) — qolgani
 * ilovaga push bo'lib boradi. SMS ketadigan ikki hodisada push HAM ketadi:
 * ilova ochiq bo'lsa xaridor SMS kutmaydi.
 *
 * Hamma matn SHU YERDA — ikki tilda (`users.lang`; bo'sh bo'lsa `uz`).
 * `data` ichida ilova uchun: `type`, `order_id` va (bo'lsa)
 * `tracking_token` + `path` — qaysi ekranni ochish.
 *
 * QOIDA: push yuborilmasa asosiy amal buzilmaydi — hamma xato yutiladi
 * (`pushTo` ning o'zi ham hech qachon xato tashlamaydi).
 */
const logger = new Logger('CustomerPush');

type Lang = 'uz' | 'ru';

async function langOf(userId: number): Promise<Lang> {
  try {
    const rows: any[] = await DeviceToken.sequelize.query(
      'SELECT lang FROM users WHERE id = :id',
      { replacements: { id: userId }, type: QueryTypes.SELECT },
    );
    return rows[0]?.lang === 'ru' ? 'ru' : 'uz';
  } catch {
    // `lang` ustuni hali migratsiya qilinmagan bo'lsa ham ishlashda davom etadi
    return 'uz';
  }
}

async function send(userId: number | null | undefined, build: (lang: Lang) => PushMessage) {
  try {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) return;
    await pushTo('user', [id], build(await langOf(id)));
  } catch (e) {
    logger.warn(`Xaridorga push yuborilmadi: ${(e as Error).message}`);
  }
}

/** Buyurtmaning egasi (push manzili). */
export async function orderOwnerId(orderId: number): Promise<number | null> {
  try {
    const rows: any[] = await DeviceToken.sequelize.query(
      'SELECT user_id FROM orders WHERE id = :id',
      { replacements: { id: orderId }, type: QueryTypes.SELECT },
    );
    return rows[0]?.user_id ?? null;
  } catch {
    return null;
  }
}

/** KP tayyor (№25/№28) — SMS bilan birga. */
export const pushQuoteReady = (orderId: number, userId?: number | null) =>
  send(userId, (lang) => ({
    title: lang === 'ru' ? 'КП готово' : 'KP tayyor',
    body:
      lang === 'ru'
        ? `#${orderId}: КП готово — посмотрите`
        : `#${orderId}: KP tayyor — ko'rib chiqing`,
    data: { type: 'quote_ready', order_id: orderId, path: `/orders/${orderId}` },
  }));

/** Buyurtma holati o'zgardi. */
const STATUS_LABEL: Record<string, { uz: string; ru: string }> = {
  new: { uz: 'yangi', ru: 'новый' },
  quote_sent: { uz: 'KP yuborildi', ru: 'КП отправлено' },
  paid: { uz: 'tasdiqlandi', ru: 'подтверждён' },
  shipping: { uz: "yo'lda", ru: 'в пути' },
  done: { uz: 'topshirildi', ru: 'доставлен' },
  cancelled: { uz: 'bekor qilindi', ru: 'отменён' },
};

export const pushOrderStatus = (orderId: number, userId: number | null | undefined, status: string) =>
  send(userId, (lang) => {
    const label = STATUS_LABEL[status]?.[lang] ?? status;
    return {
      title: lang === 'ru' ? 'Статус заказа' : 'Buyurtma holati',
      body: lang === 'ru' ? `Заказ #${orderId}: ${label}` : `#${orderId} buyurtma: ${label}`,
      data: { type: 'order_status', order_id: orderId, status, path: `/orders/${orderId}` },
    };
  });

/** Kuryer yo'lga chiqdi — SMS bilan birga. */
export const pushCourierOnTheWay = (
  orderId: number,
  userId: number | null | undefined,
  courierName: string | null,
  etaMinutes: number | null,
  trackingToken: string | null,
) =>
  send(userId, (lang) => {
    const name = (courierName || '').trim();
    const eta = etaMinutes ? (lang === 'ru' ? `, ~${etaMinutes} мин` : `, ~${etaMinutes} daqiqa`) : '';
    return {
      title: lang === 'ru' ? 'Курьер в пути' : "Kuryer yo'lda",
      body:
        lang === 'ru'
          ? `Курьер ${name} в пути${eta}`.replace('Курьер  ', 'Курьер ')
          : `Kuryer ${name} yo'lda${eta}`.replace('Kuryer  ', 'Kuryer '),
      data: {
        type: 'courier_on_the_way',
        order_id: orderId,
        ...(trackingToken ? { tracking_token: trackingToken, path: `/track/${trackingToken}` } : {}),
      },
    };
  });

/** Kuryer yetib keldi (№26.4). */
export const pushCourierArrived = (
  orderId: number,
  userId: number | null | undefined,
  trackingToken?: string | null,
) =>
  send(userId, (lang) => ({
    title: lang === 'ru' ? 'Курьер прибыл' : 'Kuryer yetib keldi',
    body: lang === 'ru' ? 'Курьер прибыл' : 'Kuryer yetib keldi',
    data: {
      type: 'courier_arrived',
      order_id: orderId,
      ...(trackingToken ? { tracking_token: trackingToken, path: `/track/${trackingToken}` } : {}),
    },
  }));

/** Topshirildi. */
export const pushOrderDelivered = (orderId: number, userId?: number | null) =>
  send(userId, (lang) => ({
    title: lang === 'ru' ? 'Заказ доставлен' : 'Buyurtma topshirildi',
    body:
      lang === 'ru' ? `#${orderId} доставлен. Спасибо!` : `#${orderId} topshirildi. Rahmat!`,
    data: { type: 'order_delivered', order_id: orderId, path: `/orders/${orderId}` },
  }));
