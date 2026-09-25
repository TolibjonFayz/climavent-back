import { Logger } from '@nestjs/common';
import { QueryTypes, Transaction } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { OrderActorType, recordOrderEvent } from './order-events';
import { pushOrderPacking, pushOrderReady } from 'src/deliveries/customer-push';

/**
 * Yig'ish holati — BUYURTMA x DO'KON (topshiriq №38, 1-band).
 *
 * Bitta buyurtmada bir nechta do'kon tovari bo'lishi mumkin, shuning uchun
 * holat buyurtmaning o'zida emas, har do'kon uchun alohida saqlanadi.
 * Yozuv do'konning birinchi TOVAR qatori tushganda trigger bilan yaratiladi;
 * eski buyurtmada yozuv yo'q bo'lsa — `waiting`.
 */
export const STAGES = ['waiting', 'packing', 'ready'] as const;
export type Stage = (typeof STAGES)[number];

@Table({ tableName: 'order_store_progress', createdAt: 'created_at', updatedAt: 'updated_at' })
export class OrderStoreProgress extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true }) id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) order_id: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) store_id: number;
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'waiting' }) stage: string;
  @Column({ type: DataType.DATE, allowNull: true }) packing_at: Date | null;
  @Column({ type: DataType.DATE, allowNull: true }) ready_at: Date | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) updated_by: number | null;
  declare created_at: Date;
  declare updated_at: Date;
}

/**
 * Ruxsat etilgan o'tishlar (1-band): `waiting → packing → ready`,
 * `waiting → ready` (kichik buyurtma) va xato bosilganda `ready → packing`.
 */
export const STAGE_TRANSITIONS: Record<string, Stage[]> = {
  waiting: ['packing', 'ready'],
  packing: ['ready'],
  ready: ['packing'],
};

export interface StoreStage {
  store_id: number;
  stage: Stage;
  packing_at: Date | null;
  ready_at: Date | null;
}

/**
 * Buyurtmada TOVARI bor do'konlar va ularning yig'ish holati.
 * Faqat xizmat sotayotgan do'kon bu ro'yxatda yo'q — xizmatni "yig'ib" bo'lmaydi (№39).
 */
export async function storeStages(sequelize: any, orderId: number, t?: Transaction): Promise<StoreStage[]> {
  const rows: any[] = await sequelize.query(
    `SELECT s.store_id, COALESCE(p.stage, 'waiting') AS stage, p.packing_at, p.ready_at
       FROM (SELECT DISTINCT i.store_id FROM "order-items" i
              WHERE i.order_id = :order AND i.item_type = 'product' AND i.store_id IS NOT NULL) s
       LEFT JOIN order_store_progress p ON p.order_id = :order AND p.store_id = s.store_id
      ORDER BY s.store_id`,
    { replacements: { order: orderId }, type: QueryTypes.SELECT, transaction: t },
  );
  return rows.map((r) => ({
    store_id: Number(r.store_id),
    stage: r.stage as Stage,
    packing_at: r.packing_at ? new Date(r.packing_at) : null,
    ready_at: r.ready_at ? new Date(r.ready_at) : null,
  }));
}

// ============================================================ umumiy holat
/**
 * Avtomatik boshqariladigan holatlar va ularning "bosqichi". Holat faqat
 * OLDINGA suriladi; bir bosqich ichida yon o'tish mumkin: `packing <-> ready`
 * (yig'ish orqaga qaytarildi) va `shipping <-> in_progress` (kuryer yo'lda /
 * usta ishlayapti).
 */
const RANK: Record<string, number> = {
  new: 0,
  paid: 0,
  quote_sent: 0,
  packing: 1,
  ready: 1,
  shipping: 2,
  in_progress: 2,
  done: 3,
};

const logger = new Logger('OrderProgress');

export interface SyncOptions {
  actor_type?: OrderActorType;
  actor_id?: number | null;
  transaction?: Transaction;
  note?: string | null;
}

/**
 * Buyurtmaning umumiy holatini yig'ish bosqichi, yetkazishlar va ishlardan
 * hisoblaydi (№38, 1-band; №39, 7-band). YAGONA joy — deliveries ham,
 * ishlar ham, yig'ish endpointi ham shuni chaqiradi.
 *
 *   done        — kamida bitta yetkazish yoki ish bor, HAMMA yetkazishlar
 *                 `delivered` VA hamma ishlar `completed` (tovari bor, lekin
 *                 yetkazishi yo'q buyurtma ishdan `done` bo'lmaydi);
 *   shipping    — yetkazish `on_the_way` (yoki yetkazish boshlangan, ish esa hali yo'q);
 *   in_progress — birinchi ish `on_the_way` yoki undan keyin;
 *   ready       — tovari bor HAMMA do'konlar `ready`;
 *   packing     — kamida bitta do'kon `packing`/`ready`.
 *
 * Bekor qilingan va qo'lda qo'yilgan `done` ga tegilmaydi. Kafolat ishi
 * (`parent_job_id`) buyurtmani qayta ochmaydi.
 */
export async function syncOrderStatus(sequelize: any, orderId: number, opts: SyncOptions = {}): Promise<string | null> {
  const run = async (t: Transaction) => {
    const [order]: any[] = await sequelize.query('SELECT id, status, user_id FROM orders WHERE id = :id FOR UPDATE', {
      replacements: { id: orderId },
      type: QueryTypes.SELECT,
      transaction: t,
    });
    if (!order || RANK[order.status] === undefined || order.status === 'done') return null;

    const [agg]: any[] = await sequelize.query(
      `SELECT
         (SELECT COUNT(*) FROM "order-items" WHERE order_id = :id AND item_type = 'product')::int AS product_rows,
         (SELECT COALESCE(array_agg(status), '{}') FROM deliveries
           WHERE order_id = :id AND status NOT IN ('cancelled', 'returned')) AS deliveries,
         (SELECT COALESCE(array_agg(status), '{}') FROM service_jobs
           WHERE order_id = :id AND status <> 'cancelled' AND parent_job_id IS NULL) AS jobs`,
      { replacements: { id: orderId }, type: QueryTypes.SELECT, transaction: t },
    );
    const deliveries: string[] = agg.deliveries || [];
    const jobs: string[] = agg.jobs || [];

    let target: string | null = null;
    const allDelivered = deliveries.every((s) => s === 'delivered');
    const allCompleted = jobs.every((s) => s === 'completed');
    const deliveryCovers = Number(agg.product_rows) === 0 || deliveries.length > 0;
    if ((deliveries.length || jobs.length) && allDelivered && allCompleted && deliveryCovers) {
      target = 'done';
    } else if (deliveries.includes('on_the_way')) {
      target = 'shipping';
    } else if (jobs.some((s) => ['on_the_way', 'arrived', 'in_progress', 'completed', 'failed'].includes(s))) {
      target = 'in_progress';
    } else if (deliveries.some((s) => ['delivered', 'failed'].includes(s))) {
      target = 'shipping';
    } else {
      const stages = await storeStages(sequelize, orderId, t);
      if (stages.length && stages.every((s) => s.stage === 'ready')) target = 'ready';
      else if (stages.some((s) => s.stage !== 'waiting')) target = 'packing';
    }
    if (!target || target === order.status) return null;

    const from = order.status;
    const lateral =
      (['packing', 'ready'].includes(from) && ['packing', 'ready'].includes(target)) ||
      (['shipping', 'in_progress'].includes(from) && ['shipping', 'in_progress'].includes(target));
    if (!(RANK[target] > RANK[from] || lateral)) return null;

    await sequelize.query(`UPDATE orders SET status = :to, "updatedAt" = now() WHERE id = :id`, {
      replacements: { id: orderId, to: target },
      transaction: t,
    });
    // Mijozga "yig'ilyapti"/"yig'ildi" push'i BIR MARTA: ikkinchi do'kon
    // `packing` qilganda yoki `ready -> packing -> ready` da qayta ketmaydi.
    const [seen]: any[] = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM order_events
        WHERE order_id = :id AND event = 'status_changed' AND to_status = :to`,
      { replacements: { id: orderId, to: target }, type: QueryTypes.SELECT, transaction: t },
    );
    await recordOrderEvent({
      order_id: orderId,
      event: 'status_changed',
      from_status: from,
      to_status: target,
      actor_type: opts.actor_type ?? 'system',
      actor_id: opts.actor_id ?? null,
      note: opts.note ?? 'Avtomatik',
      transaction: t,
    });
    return { to: target, first: Number(seen?.n) === 0, user_id: order.user_id };
  };

  try {
    const result = opts.transaction
      ? await run(opts.transaction)
      : await sequelize.transaction((t: Transaction) => run(t));
    if (!result) return null;
    if (result.first) {
      const pushNow = () => {
        if (result.to === 'packing') void pushOrderPacking(orderId, result.user_id);
        if (result.to === 'ready') void pushOrderReady(orderId, result.user_id);
      };
      const t: any = opts.transaction;
      if (t && typeof t.afterCommit === 'function') t.afterCommit(pushNow);
      else pushNow();
    }
    return result.to;
  } catch (e) {
    if (opts.transaction) throw e;
    logger.error(`Buyurtma #${orderId} holatini hisoblab bo'lmadi: ${(e as Error).message}`);
    return null;
  }
}
