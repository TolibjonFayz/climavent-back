import { Logger } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { DeviceToken } from './model/models';
import { emptyPushResult, logPush, mergeResults, pushTo, PushMessage } from './push';

/**
 * SOTUVCHIGA PUSH — "CV Hamkor" ilovasi (topshiriq №31).
 *
 * Kimga: do'konning barcha FAOL `store_admin` hisoblari + buyurtma/KP ruxsatli
 * (`orders.view` yoki `carts.view`) faol XODIMLARI (topshiriq №35).
 * Matnlar SHU YERDA (uz/ru) — ilova faqat `data.type` ni o'qiydi.
 *
 * Har xabarda:
 *   `data.type`     — hodisa turi (ilova shunga qarab ekran ochadi);
 *   `data.order_id` — MAJBURIY (ilova `/order/:id` ni ochadi);
 *   `channel: 'orders'` — Android bildirishnoma kanali.
 *
 * QOIDA: push yuborilmasa asosiy amal buzilmaydi — hamma xato yutiladi.
 */
const logger = new Logger('StorePush');

type Lang = 'uz' | 'ru';

/** Kanal nomi ilovada e'lon qilingan (`orders`). */
const CHANNEL = 'orders';

/**
 * Do'kon adminlarini TILI bo'yicha guruhlaydi.
 *
 * `store_users.lang` ustuni modelda e'lon qilinmagan (migratsiyadan oldin
 * deploy bo'lsa hamma so'rov yiqilmasin) — shuning uchun xom SQL. Ustun
 * hali yo'q bo'lsa hammasi `uz` bo'lib qoladi.
 */
async function adminsByLang(storeIds: number[]): Promise<Map<Lang, number[]>> {
  const out = new Map<Lang, number[]>();
  const ids = [...new Set(storeIds.filter((x) => Number.isInteger(x) && x > 0))];
  if (!ids.length) return out;
  let rows: any[] = [];
  try {
    rows = (await DeviceToken.sequelize.query(
      `SELECT su.id, su.lang FROM store_users su
         LEFT JOIN store_roles r ON r.id = su.store_role_id
        WHERE su.is_active AND su.store_id IN (:ids)
          AND (su.role = 'store_admin'
            OR (su.role = 'store_staff' AND r.permissions && ARRAY['orders.view', 'carts.view']::text[]))`,
      { replacements: { ids }, type: QueryTypes.SELECT },
    )) as any[];
  } catch {
    // `lang` ustuni yo'q (migratsiya ishlatilmagan) — tilsiz o'qiymiz
    rows = (await DeviceToken.sequelize.query(
      `SELECT id FROM store_users
        WHERE role = 'store_admin' AND is_active AND store_id IN (:ids)`,
      { replacements: { ids }, type: QueryTypes.SELECT },
    )) as any[];
  }
  for (const r of rows) {
    const lang: Lang = r.lang === 'ru' ? 'ru' : 'uz';
    out.set(lang, [...(out.get(lang) || []), Number(r.id)]);
  }
  return out;
}

/**
 * Har tilga o'z matni bilan yuboradi.
 *
 * Log — HAR DO'KONGA BITTA qator (topshiriq №32, 1-band), qabul qiluvchi
 * topilmasa ham: "Push: buyurtma #116, do'kon 1 (new_order, hisob 49) —
 * 0 ta qurilma topildi, yuborilmadi". Hisob ro'yxati qatorda bo'lgani uchun
 * "token boshqa hisobda turibdi" holati logdan darhol ko'rinadi.
 */
export async function sendToStore(storeIds: number[], build: (lang: Lang) => PushMessage) {
  const sample = build('uz');
  for (const storeId of [...new Set(storeIds.filter((x) => Number.isInteger(x) && x > 0))]) {
    try {
      const groups = await adminsByLang([storeId]);
      const owners = [...groups.values()].flat();
      const label =
        `buyurtma #${sample.data?.order_id}, do'kon ${storeId} ` +
        `(${sample.data?.type}, hisob ${owners.join(',') || "yo'q — faol store_admin topilmadi"})`;
      let result = emptyPushResult();
      for (const [lang, ids] of groups) {
        const r = await pushTo('store_user', ids, { ...build(lang), channel: CHANNEL }, { quiet: true });
        result = mergeResults(result, r);
      }
      if (!groups.size) {
        // Hisob yo'q — baribir "sozlanmagan"mi yoki yo'qmi, ko'rinsin
        result = await pushTo('store_user', [], sample, { quiet: true });
      }
      logPush(label, sample.title, result);
    } catch (e) {
      logger.warn(`Sotuvchiga push yuborilmadi (do'kon ${storeId}): ${(e as Error).message}`);
    }
  }
}

/** "148 692 000" ko'rinishida. */
const money = (value: number) =>
  Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * Buyurtmaning SHU DO'KONGA tegishli qismi: birinchi qator nomi, qatorlar
 * soni va (hammasi narxlangan bo'lsa) summa.
 */
async function orderSummary(orderId: number, storeId: number) {
  const rows: any[] = await DeviceToken.sequelize.query(
    `SELECT COALESCE(NULLIF(btrim(i.product_model), ''), p.name_uz, p.name_ru, p.name_en) AS name,
            i.quantity, i.price
       FROM "order-items" i
       JOIN products p ON p.id = i.product_id
      WHERE i.order_id = :order AND p.store_id = :store
      ORDER BY i.id`,
    { replacements: { order: orderId, store: storeId }, type: QueryTypes.SELECT },
  );
  const total = rows.reduce(
    (acc, r) => (r.price === null || acc === null ? null : acc + Number(r.price) * Number(r.quantity)),
    0 as number | null,
  );
  return {
    first: rows[0]?.name ? String(rows[0].name) : null,
    count: rows.length,
    total,
    unpriced: rows.filter((r) => r.price === null).length,
  };
}

/** Yangi buyurtma: «Chiller JV-65 va yana 2 ta · 148 692 000 so'm». */
export async function pushNewOrder(orderId: number, storeId: number) {
  try {
    const s = await orderSummary(orderId, storeId);
    await sendToStore([storeId], (lang) => {
      const nom = s.first || (lang === 'ru' ? 'Заказ' : 'Buyurtma');
      const yana =
        s.count > 1
          ? lang === 'ru'
            ? ` и ещё ${s.count - 1}`
            : ` va yana ${s.count - 1} ta`
          : '';
      const summa =
        s.total !== null && s.total > 0
          ? lang === 'ru'
            ? ` · ${money(s.total)} сум`
            : ` · ${money(s.total)} so'm`
          : '';
      return {
        title: lang === 'ru' ? `Новый заказ #${orderId}` : `Yangi buyurtma #${orderId}`,
        body: `${nom}${yana}${summa}`.slice(0, 180),
        data: { type: 'new_order', order_id: orderId },
      };
    });
  } catch (e) {
    logger.warn(`new_order push: ${(e as Error).message}`);
  }
}

/** KP so'rovi: narxsiz qator bor — «3 ta qator narxsiz — narx yozing». */
export const pushQuoteRequest = (orderId: number, storeId: number, unpriced: number) =>
  sendToStore([storeId], (lang) => ({
    title: lang === 'ru' ? `Запрос КП #${orderId}` : `KP so'rovi #${orderId}`,
    body:
      lang === 'ru'
        ? `${unpriced} позиций без цены — укажите цену`
        : `${unpriced} ta qator narxsiz — narx yozing`,
    data: { type: 'quote_request', order_id: orderId, unpriced },
  }));

/**
 * 4 soat o'tdi, bo'lim hali narxsiz (topshiriq №33, 2-band). 24 soatda
 * bo'lim xaridor KP sidan tushib qoladi — matnda qolgan vaqt.
 */
export const pushQuoteRequestReminder = (orderId: number, storeId: number, unpriced: number, hoursLeft: number) =>
  sendToStore([storeId], (lang) => ({
    title: lang === 'ru' ? `Ожидается КП #${orderId}` : `KP so'rovi kutilmoqda #${orderId}`,
    body:
      lang === 'ru'
        ? `${unpriced} поз. без цены — осталось ~${hoursLeft} ч`
        : `${unpriced} ta qator narxsiz — ~${hoursLeft} soat qoldi`,
    data: { type: 'quote_request_reminder', order_id: orderId, unpriced, hours_left: hoursLeft },
  }));

/** Mijoz KP ni qabul qildi. */
export const pushQuoteAccepted = (orderId: number, storeIds: number[]) =>
  sendToStore(storeIds, (lang) => ({
    title: lang === 'ru' ? `КП принято #${orderId}` : `KP qabul qilindi #${orderId}`,
    body:
      lang === 'ru'
        ? 'Согласуйте с клиентом оплату и доставку'
        : "Mijoz bilan to'lov va yetkazishni kelishing",
    data: { type: 'quote_accepted', order_id: orderId },
  }));

/** Mijoz KP ni rad etdi (sabab bo'lsa — matnda). */
export const pushQuoteRejected = (orderId: number, storeIds: number[], reason?: string | null) =>
  sendToStore(storeIds, (lang) => {
    const sabab = (reason || '').trim();
    return {
      title: lang === 'ru' ? `КП отклонено #${orderId}` : `KP rad etildi #${orderId}`,
      body: sabab
        ? (lang === 'ru' ? `Причина: ${sabab}` : `Sabab: ${sabab}`).slice(0, 180)
        : lang === 'ru'
          ? 'Причина не указана'
          : "Sabab ko'rsatilmagan",
      data: { type: 'quote_rejected', order_id: orderId },
    };
  });

/** Mijoz eskirgan KP o'rniga yangisini so'radi. */
export const pushQuoteRequestAgain = (orderId: number, storeIds: number[]) =>
  sendToStore(storeIds, (lang) => ({
    title: lang === 'ru' ? `Запрошено новое КП #${orderId}` : `Yangi KP so'raldi #${orderId}`,
    body: lang === 'ru' ? 'Вместо просроченного КП' : "Muddati o'tgan KP o'rniga",
    data: { type: 'quote_request_again', order_id: orderId },
  }));

/**
 * Kuryer rad etdi yoki yetkaza olmadi.
 *
 * Topshiriq №31 da ikkisi ham BITTA tur (`delivery_failed`), chunki ilova
 * ikkalasida ham buyurtma sahifasini ochadi. Farq `data.reason` va matnda.
 */
export const pushDeliveryFailed = (
  orderId: number,
  deliveryId: number,
  storeId: number,
  reason?: string | null,
) =>
  sendToStore([storeId], (lang) => {
    const sabab = (reason || '').trim();
    return {
      title: lang === 'ru' ? `Доставка не состоялась #${orderId}` : `Yetkazish bo'lmadi #${orderId}`,
      body: sabab || (lang === 'ru' ? 'Причина не указана' : "Sabab ko'rsatilmagan"),
      data: {
        type: 'delivery_failed',
        order_id: orderId,
        delivery_id: deliveryId,
        ...(sabab ? { reason: sabab } : {}),
      },
    };
  });

/**
 * Hisob nofaol qilindi yoki o'chirildi — qurilma tokenlari ham o'chadi
 * (topshiriq №31, "Qoidalar"). Aks holda push chiqarilgan xodimning
 * telefoniga kelib turardi.
 */
export async function dropDeviceTokens(ownerType: 'store_user' | 'user', ownerId: number) {
  try {
    await DeviceToken.destroy({ where: { owner_type: ownerType, owner_id: ownerId } });
  } catch (e) {
    logger.warn(`Qurilma tokenlari o'chirilmadi (${ownerType} ${ownerId}): ${(e as Error).message}`);
  }
}
