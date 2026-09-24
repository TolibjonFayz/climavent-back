import { Logger } from '@nestjs/common';
import { QueryTypes, Transaction } from 'sequelize';
import { clientRoom, realtimeServer, storeOrdersRoom } from 'src/chats/chat-hub';
import { Order } from './model/order.model';

/**
 * Buyurtma o'zgardi — socket SIGNALI (topshiriq №36).
 *
 *   hodisa:  `order_updated`, namespace `/chat`
 *   payload: `{ order_id, status, at }` — faqat qaysi buyurtma o'zgargani.
 *
 * To'liq ma'lumot socketda YUBORILMAYDI: ilova buyurtmani odatdagi REST bilan
 * qayta oladi — huquq tekshiruvi bitta joyda qoladi va socket formati
 * buyurtma modeliga bog'lanmaydi. Push bilan munosabat yo'q: ikkalasi ham ketadi.
 *
 * Kimga: buyurtma egasi `client:<user_id>`, buyurtmada qatori bor har bir
 * do'kon `store-orders:<store_id>` (chat xonasi `store:<id>` EMAS — `chat-hub.ts`).
 *
 * Qayerdan chaqiriladi: controller'larda emas, markaziy joylarda —
 *   `recordOrderEvent`  — holat va KP hodisalarining HAMMASI (yaratildi,
 *                         holat, KP yuborildi/qabul/rad/qayta so'rov,
 *                         bo'lim muddati, yetkazish);
 *   `recomputeOrderTotal` — qator qo'shildi / soni yoki narxi o'zgardi / o'chirildi;
 *   hodisa yozmaydigan bir nechta joy (buyurtma maydonlarini tahrirlash,
 *   o'chirish, yetkazishdan keyingi `shipping`/`done`).
 *
 * Bitta so'rov bir necha marta chaqiradi (masalan KP yaratishda hodisa +
 * summa + holat) — signallar buyurtma bo'yicha QISQA OYNADA birlashtiriladi
 * va holat yuborish PAYTIDA bazadan o'qiladi, ya'ni ilova bitta signal oladi
 * va unda oxirgi holat bo'ladi. Tranzaksiya ichida chaqirilsa — commit'dan
 * keyin (rollback bo'lsa signal yo'q).
 */
const logger = new Logger('OrderSignal');

/** Birlashtirish oynasi: shu vaqt ichida yangi chaqiruv bo'lmasa yuboriladi. */
const COALESCE_MS = 150;
/** Uzluksiz chaqiruvlarda ham signal shundan kechikmaydi. */
const MAX_DELAY_MS = 1000;

export interface OrderSignalOptions {
  /** Signal shu tranzaksiya commit bo'lgandan keyin ketadi. */
  transaction?: Transaction | null;
  /**
   * Qatorlari shu buyurtmadan KETGAN do'konlar ham xabar olsin (KP qisman
   * qabul qilinganda narxsiz qism davomi buyurtmaga ko'chadi — №33).
   */
  extraStores?: number[];
  /**
   * Buyurtma o'chirilayotgan bo'lsa — o'chirishdan OLDINGI qabul qiluvchilar
   * (keyin bazada topilmaydi). Status `deleted` bo'lib ketadi.
   */
  recipients?: { user_id: number | null; store_ids: number[] } | null;
}

interface Pending {
  timer: NodeJS.Timeout;
  firstAt: number;
  stores: Set<number>;
  users: Set<number>;
}
const pending = new Map<number, Pending>();

export function emitOrderUpdated(orderId: number, opts: OrderSignalOptions = {}): void {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) return;
  const schedule = () => enqueue(id, opts);
  const t = opts.transaction as any;
  if (t && typeof t.afterCommit === 'function') t.afterCommit(schedule);
  else schedule();
}

function enqueue(id: number, opts: OrderSignalOptions) {
  // Socket yo'q (sinov konteksti, fon ishi alohida jarayonda) — hech narsa qilmaymiz
  if (!realtimeServer()) return;
  const now = Date.now();
  let p = pending.get(id);
  if (p) clearTimeout(p.timer);
  else {
    p = { timer: null as any, firstAt: now, stores: new Set(), users: new Set() };
    pending.set(id, p);
  }
  for (const s of opts.extraStores || []) if (Number(s) > 0) p.stores.add(Number(s));
  if (opts.recipients) {
    if (Number(opts.recipients.user_id) > 0) p.users.add(Number(opts.recipients.user_id));
    for (const s of opts.recipients.store_ids || []) if (Number(s) > 0) p.stores.add(Number(s));
  }
  const wait = Math.max(0, Math.min(COALESCE_MS, p.firstAt + MAX_DELAY_MS - now));
  const entry = p;
  p.timer = setTimeout(() => {
    pending.delete(id);
    fire(id, entry).catch((e) => logger.warn(`order_updated #${id}: ${(e as Error).message}`));
  }, wait);
  // Jarayonni ushlab turmasin (sinov skriptlari, graceful shutdown)
  p.timer.unref?.();
}

async function fire(id: number, p: Pending) {
  const server = realtimeServer();
  if (!server) return;
  const row = await loadTargets(id);
  const users = new Set(p.users);
  const stores = new Set(p.stores);
  if (row) {
    if (Number(row.user_id) > 0) users.add(Number(row.user_id));
    for (const s of row.store_ids) stores.add(s);
  }
  if (!users.size && !stores.size) return;

  const payload = { order_id: id, status: row ? row.status : 'deleted', at: new Date().toISOString() };
  const rooms = [...[...users].map(clientRoom), ...[...stores].map(storeOrdersRoom)];
  server.to(rooms).emit('order_updated', payload);
}

/** Buyurtma egasi, do'konlari va holati; buyurtma yo'q bo'lsa `null`. */
async function loadTargets(id: number): Promise<{ status: string; user_id: number | null; store_ids: number[] } | null> {
  const [row]: any[] = await Order.sequelize!.query(
    `SELECT o.status, o.user_id,
            ARRAY(SELECT DISTINCT p.store_id FROM "order-items" i
                    JOIN products p ON p.id = i.product_id
                   WHERE i.order_id = o.id AND p.store_id IS NOT NULL) AS store_ids
       FROM orders o WHERE o.id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  if (!row) return null;
  return { status: row.status, user_id: row.user_id ?? null, store_ids: (row.store_ids || []).map(Number) };
}

/** O'chirishdan oldin: kimga xabar berish kerakligi (`recipients` uchun). */
export async function orderRecipients(orderId: number): Promise<{ user_id: number | null; store_ids: number[] }> {
  const row = await loadTargets(Number(orderId));
  return { user_id: row?.user_id ?? null, store_ids: row?.store_ids ?? [] };
}
