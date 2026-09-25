import { sendToCustomer, t3 } from 'src/deliveries/customer-push';
import { pushToCourier } from 'src/deliveries/push';
import { sendToStore } from 'src/deliveries/store-push';

/**
 * Ish pushlari — topshiriq №39, 9-band. SMS YO'Q.
 *
 * `data`: `{ type: 'order', order_id, job_id, event }` — ilova buyurtma/ish
 * sahifasini ochadi. Socket'da alohida hodisa yo'q: `order_updated` (№36)
 * `recordOrderEvent` orqali o'zi ketadi.
 *
 * Push yuborilmasa asosiy amal buzilmaydi (`pushTo` xato tashlamaydi).
 */
const data = (orderId: number, jobId: number, event: string, extra: Record<string, string | number> = {}) => ({
  type: 'order',
  order_id: orderId,
  job_id: jobId,
  event,
  ...extra,
});

const money = (v: number | null | undefined) =>
  v === null || v === undefined
    ? ''
    : Math.round(v)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const fmtTime = (d: Date | null | undefined) => {
  if (!d) return '';
  return new Intl.DateTimeFormat('uz-UZ', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(d));
};

// ============================================================ mijozga
export const pushJobScheduleConfirmed = (orderId: number, jobId: number, userId: number | null, from: Date | null) =>
  sendToCustomer(userId, (lang) => ({
    title: t3(lang, 'Usta vaqti tasdiqlandi', 'Время мастера подтверждено', 'Visit time confirmed'),
    body: t3(lang, `Buyurtma #${orderId}: ${fmtTime(from)}`, `Заказ #${orderId}: ${fmtTime(from)}`, `Order #${orderId}: ${fmtTime(from)}`),
    data: data(orderId, jobId, 'schedule_confirmed'),
  }));

export const pushJobRescheduled = (orderId: number, jobId: number, userId: number | null, from: Date | null) =>
  sendToCustomer(userId, (lang) => ({
    title: t3(lang, 'Boshqa vaqt taklif qilindi', 'Предложено другое время', 'Another time proposed'),
    body: t3(
      lang,
      `Buyurtma #${orderId}: ${fmtTime(from)} — tasdiqlang`,
      `Заказ #${orderId}: ${fmtTime(from)} — подтвердите`,
      `Order #${orderId}: ${fmtTime(from)} — please confirm`,
    ),
    data: data(orderId, jobId, 'schedule_rescheduled'),
  }));

export const pushWorkerOnTheWay = (orderId: number, jobId: number, userId: number | null, name: string, eta: number | null) =>
  sendToCustomer(userId, (lang) => {
    const tail = eta ? t3(lang, `, ~${eta} daqiqa`, `, ~${eta} мин`, `, ~${eta} min`) : '';
    return {
      title: t3(lang, "Usta yo'lda", 'Мастер в пути', 'Technician on the way'),
      body: t3(lang, `Usta ${name} yo'lda${tail}`, `Мастер ${name} в пути${tail}`, `${name} is on the way${tail}`).replace(/\s+/g, ' '),
      data: data(orderId, jobId, 'worker_on_the_way'),
    };
  });

export const pushWorkerArrived = (orderId: number, jobId: number, userId: number | null) =>
  sendToCustomer(userId, (lang) => ({
    title: t3(lang, 'Usta yetib keldi', 'Мастер прибыл', 'Technician arrived'),
    body: t3(lang, `Buyurtma #${orderId}`, `Заказ #${orderId}`, `Order #${orderId}`),
    data: data(orderId, jobId, 'worker_arrived'),
  }));

/** Narx o'zgarishi — tasdiq kerak (YUQORI muhimlik). */
export const pushJobPriceChange = (orderId: number, jobId: number, userId: number | null, amount: number) =>
  sendToCustomer(userId, (lang) => ({
    title: t3(lang, 'Narxni tasdiqlang', 'Подтвердите цену', 'Please confirm the price'),
    body: t3(
      lang,
      `Usta yakuniy narxni yubordi: ${money(amount)} so'm`,
      `Мастер указал итоговую цену: ${money(amount)} сум`,
      `The technician set the final price: ${money(amount)} UZS`,
    ),
    data: data(orderId, jobId, 'price_change', { amount }),
  }));

export const pushJobCompleted = (orderId: number, jobId: number, userId: number | null) =>
  sendToCustomer(userId, (lang) => ({
    title: t3(lang, 'Ish tugadi', 'Работа завершена', 'Work completed'),
    body: t3(
      lang,
      `Buyurtma #${orderId}: ustaga baho bering`,
      `Заказ #${orderId}: оцените мастера`,
      `Order #${orderId}: please rate the technician`,
    ),
    data: data(orderId, jobId, 'job_completed', { ask_review: 1 }),
  }));

// ============================================================ hamkorga
export const pushStoreNewServiceOrder = (orderId: number, jobId: number, storeId: number, summary: string) =>
  sendToStore([storeId], (lang) => ({
    title: lang === 'ru' ? `Новый заказ услуги #${orderId}` : `Yangi xizmat buyurtmasi #${orderId}`,
    body: summary.slice(0, 180),
    data: data(orderId, jobId, 'new_service_order'),
  }));

export const pushStoreScheduleAnswer = (orderId: number, jobId: number, storeId: number, accepted: boolean) =>
  sendToStore([storeId], (lang) => ({
    title: accepted
      ? lang === 'ru'
        ? `Клиент подтвердил время #${orderId}`
        : `Mijoz vaqtni tasdiqladi #${orderId}`
      : lang === 'ru'
        ? `Клиент отклонил время #${orderId}`
        : `Mijoz vaqtni rad etdi #${orderId}`,
    body: accepted
      ? lang === 'ru'
        ? 'Можно назначать мастера'
        : 'Usta yuborish mumkin'
      : lang === 'ru'
        ? 'Согласуйте время в чате'
        : 'Vaqtni chatda kelishing',
    data: data(orderId, jobId, accepted ? 'schedule_accepted' : 'schedule_rejected'),
  }));

export const pushStoreJobProblem = (orderId: number, jobId: number, storeId: number, text: string) =>
  sendToStore([storeId], (lang) => ({
    title: lang === 'ru' ? `Проблема с работой #${orderId}` : `Ish bo'lmadi #${orderId}`,
    body: text.slice(0, 180),
    data: data(orderId, jobId, 'job_problem'),
  }));

export const pushStoreWarrantyClaim = (orderId: number, jobId: number, storeId: number) =>
  sendToStore([storeId], (lang) => ({
    title: lang === 'ru' ? `Гарантийное обращение #${orderId}` : `Kafolat bo'yicha murojaat #${orderId}`,
    body: lang === 'ru' ? 'Клиент просит повторный визит' : "Mijoz qayta kelishni so'rayapti",
    data: data(orderId, jobId, 'warranty_claim'),
  }));

// ============================================================ ustaga
export const pushWorker = (workerId: number | null, orderId: number, jobId: number, event: string, title: string, body: string) =>
  pushToCourier(workerId, { title, body: body.slice(0, 180), data: data(orderId, jobId, event) });
