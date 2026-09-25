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

/**
 * `en` — №38 dan. Eski matnlar faqat uz/ru (`lang === 'ru' ? ... : uz`),
 * shuning uchun ularda `en` avvalgidek o'zbekcha bo'lib qoladi.
 */
export type Lang = 'uz' | 'ru' | 'en';

async function langOf(userId: number): Promise<Lang> {
  try {
    const rows: any[] = await DeviceToken.sequelize.query(
      'SELECT lang FROM users WHERE id = :id',
      { replacements: { id: userId }, type: QueryTypes.SELECT },
    );
    const lang = rows[0]?.lang;
    return lang === 'ru' || lang === 'en' ? lang : 'uz';
  } catch {
    // `lang` ustuni hali migratsiya qilinmagan bo'lsa ham ishlashda davom etadi
    return 'uz';
  }
}

export async function sendToCustomer(userId: number | null | undefined, build: (lang: Lang) => PushMessage) {
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

/**
 * KP pushlari (topshiriq №33, 1-band).
 *
 * DO'KON NOMI MATNDA YO'Q: egasining qarori (24.09) — KP Climavent nomidan
 * bitta hujjat, tovar qaysi do'kondan kelishi xaridorga ko'rsatilmaydi.
 * Shuning uchun "Jihozvent narxlarni yozdi" o'rniga umumiy matn va "2/3" hisob.
 *
 * `ready`/`total` — tayyor bo'limlar soni (`data` da ham, ilova ko'rsatishi uchun).
 */
export const pushQuoteReady = (orderId: number, userId?: number | null, ready = 1, total = 1) =>
  sendToCustomer(userId, (lang) => ({
    title: lang === 'ru' ? `КП готово #${orderId}` : `KP tayyor #${orderId}`,
    body:
      total > 1
        ? lang === 'ru'
          ? `Цены готовы (${ready}/${total}) — посмотрите`
          : `Narxlar tayyor (${ready}/${total}) — ko'rib chiqing`
        : lang === 'ru'
          ? 'Цены готовы — посмотрите'
          : "Narxlar yozildi — ko'rib chiqing",
    data: { type: 'quote_ready', order_id: orderId, ready, total, path: `/orders/${orderId}` },
  }));

/** Keyingi bo'lim tayyor bo'ldi (yoki tayyor bo'lim yangi versiya oldi). */
export const pushQuoteUpdated = (orderId: number, userId: number | null | undefined, ready: number, total: number) =>
  sendToCustomer(userId, (lang) => ({
    title: lang === 'ru' ? `КП обновлено #${orderId}` : `KP yangilandi #${orderId}`,
    body:
      lang === 'ru'
        ? `Добавлены новые цены — ${ready}/${total}`
        : `Yangi narxlar qo'shildi — ${ready}/${total}`,
    data: { type: 'quote_updated', order_id: orderId, ready, total, path: `/orders/${orderId}` },
  }));

/** Bo'lim 24 soatda javob olmadi — tayyor qismi bilan davom etish mumkin. */
export const pushQuoteTimeout = (
  orderId: number,
  userId: number | null | undefined,
  items: number,
  hasReady: boolean,
) =>
  sendToCustomer(userId, (lang) => ({
    title:
      lang === 'ru'
        ? `Часть КП без ответа #${orderId}`
        : `KP ning bir qismiga javob bo'lmadi #${orderId}`,
    body: hasReady
      ? lang === 'ru'
        ? `${items} поз. без цены — можно продолжить с готовой частью`
        : `${items} ta mahsulotga narx berilmadi — tayyor qismi bilan davom etishingiz mumkin`
      : lang === 'ru'
        ? `${items} поз. пока без цены — мы уточняем`
        : `${items} ta mahsulotga hali narx berilmadi — aniqlashtiryapmiz`,
    data: { type: 'quote_timeout', order_id: orderId, items, path: `/orders/${orderId}` },
  }));

/** Buyurtma holati o'zgardi. */
const STATUS_LABEL: Record<string, { uz: string; ru: string }> = {
  new: { uz: 'yangi', ru: 'новый' },
  quote_sent: { uz: 'KP yuborildi', ru: 'КП отправлено' },
  paid: { uz: 'tasdiqlandi', ru: 'подтверждён' },
  packing: { uz: "yig'ilyapti", ru: 'собирается' },
  ready: { uz: "yig'ildi", ru: 'собран' },
  shipping: { uz: "yo'lda", ru: 'в пути' },
  in_progress: { uz: 'bajarilmoqda', ru: 'выполняется' },
  done: { uz: 'topshirildi', ru: 'доставлен' },
  cancelled: { uz: 'bekor qilindi', ru: 'отменён' },
};

export const pushOrderStatus = (orderId: number, userId: number | null | undefined, status: string) =>
  sendToCustomer(userId, (lang) => {
    const label = STATUS_LABEL[status]?.[lang === 'ru' ? 'ru' : 'uz'] ?? status;
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
  sendToCustomer(userId, (lang) => {
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
  sendToCustomer(userId, (lang) => ({
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
  sendToCustomer(userId, (lang) => ({
    title: lang === 'ru' ? 'Заказ доставлен' : 'Buyurtma topshirildi',
    body:
      lang === 'ru' ? `#${orderId} доставлен. Спасибо!` : `#${orderId} topshirildi. Rahmat!`,
    data: { type: 'order_delivered', order_id: orderId, path: `/orders/${orderId}` },
  }));

/** Uch tildagi matndan mijoz tilidagisini oladi. */
export const t3 = (lang: Lang, uz: string, ru: string, en: string) => (lang === 'ru' ? ru : lang === 'en' ? en : uz);

/**
 * Birinchi do'kon yig'ishni boshladi (topshiriq №38, 3-band). Bir nechta
 * do'kon bo'lsa ham BIR MARTA — `syncOrderStatus` buyurtma birinchi marta
 * `packing` ga o'tganda chaqiradi.
 */
export const pushOrderPacking = (orderId: number, userId?: number | null) =>
  sendToCustomer(userId, (lang) => ({
    title: t3(lang, 'Buyurtma holati', 'Статус заказа', 'Order status'),
    body: t3(lang, `Buyurtma #${orderId} yig'ilyapti`, `Заказ #${orderId} собирается`, `Order #${orderId} is being packed`),
    data: { type: 'order', order_id: orderId, status: 'packing' },
  }));

/** Hamma do'konlar yig'ib bo'ldi (№38, 3-band). */
export const pushOrderReady = (orderId: number, userId?: number | null) =>
  sendToCustomer(userId, (lang) => ({
    title: t3(lang, 'Buyurtma holati', 'Статус заказа', 'Order status'),
    body: t3(
      lang,
      `Buyurtma #${orderId} yig'ildi, kuryerga topshiriladi`,
      `Заказ #${orderId} собран и будет передан курьеру`,
      `Order #${orderId} is packed and will be handed to the courier`,
    ),
    data: { type: 'order', order_id: orderId, status: 'ready' },
  }));
