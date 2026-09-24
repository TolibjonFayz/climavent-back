import { QueryTypes, Sequelize, Transaction } from 'sequelize';

/**
 * KP BO'LIMLARI — topshiriq №33.
 *
 * Bo'lim = buyurtmadagi BITTA do'konning qatorlari. Tayyorlik butun buyurtma
 * uchun emas, har bo'lim uchun alohida: sekin do'kon tezini to'smaydi.
 *
 * Holat (yarim holat yo'q — 3 qatordan 2 tasiga narx yozilsa ham "waiting"):
 *   ready   — bo'limning HAMMA qatorida narx bor VA oxirgi KP versiyasida
 *             narxsiz qator yo'q (hujjatga faqat shunday bo'lim tushadi);
 *   timeout — tayyor emas va so'ralganiga 24 soat bo'ldi (fon ishi belgilaydi);
 *   waiting — qolgan hamma holat.
 * Muddat o'tgandan keyin do'kon narx yozsa, bo'lim yana `ready` bo'ladi.
 *
 * Holat SERVERDA hisoblanadi — ilova, sayt va adminka bir xil ko'rsin.
 */
export const SECTION_REMIND_MS = 4 * 60 * 60 * 1000;
export const SECTION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export type SectionState = 'waiting' | 'ready' | 'timeout';

export interface QuoteSection {
  store_id: number;
  state: SectionState;
  item_count: number;
  unpriced_count: number;
  requested_at: Date;
  deadline_at: Date;
  reminded_at: Date | null;
  timed_out_at: Date | null;
  ready_at: Date | null;
  accepted_at: Date | null;
  accepted_version: number | null;
  /** Oxirgi KP versiyasi (bo'lsa). */
  quote_id: number | null;
  version: number | null;
}

/**
 * Buyurtmadagi har do'kon uchun bo'lim yozuvi bo'lsin (bor bo'lsa tegilmaydi —
 * `requested_at` ning asl qiymati saqlanadi, muddat qayta boshlanmaydi).
 */
export async function ensureSections(sequelize: Sequelize, orderId: number, t?: Transaction) {
  await sequelize.query(
    `INSERT INTO order_quote_sections (order_id, store_id)
     SELECT DISTINCT i.order_id, p.store_id
       FROM "order-items" i JOIN products p ON p.id = i.product_id
      WHERE i.order_id = :order AND p.store_id IS NOT NULL
     ON CONFLICT (order_id, store_id) DO NOTHING`,
    { replacements: { order: orderId }, transaction: t },
  );
}

export async function sectionsOf(sequelize: Sequelize, orderId: number, t?: Transaction): Promise<QuoteSection[]> {
  const rows: any[] = await sequelize.query(
    `SELECT s.store_id, s.requested_at, s.reminded_at, s.timed_out_at, s.ready_at,
            s.accepted_at, s.accepted_version,
            c.item_count, c.unpriced_count,
            lq.id AS quote_id, lq.version, lq.has_null
       FROM order_quote_sections s
       CROSS JOIN LATERAL (
         SELECT COUNT(*)::int AS item_count,
                COUNT(*) FILTER (WHERE i.price IS NULL)::int AS unpriced_count
           FROM "order-items" i JOIN products p ON p.id = i.product_id
          WHERE i.order_id = s.order_id AND p.store_id = s.store_id
       ) c
       LEFT JOIN LATERAL (
         SELECT q.id, q.version, jsonb_path_exists(q.items, '$[*] ? (@.price == null)') AS has_null
           FROM order_quotes q
          WHERE q.order_id = s.order_id AND q.store_id = s.store_id
          ORDER BY q.version DESC LIMIT 1
       ) lq ON true
      WHERE s.order_id = :order
      ORDER BY s.store_id`,
    { replacements: { order: orderId }, type: QueryTypes.SELECT, transaction: t },
  );
  return rows
    .filter((r) => Number(r.item_count) > 0)
    .map((r) => {
      const requested = new Date(r.requested_at);
      const ready =
        Number(r.unpriced_count) === 0 && r.quote_id !== null && r.has_null === false;
      return {
        store_id: Number(r.store_id),
        state: ready ? 'ready' : r.timed_out_at ? 'timeout' : 'waiting',
        item_count: Number(r.item_count),
        unpriced_count: Number(r.unpriced_count),
        requested_at: requested,
        deadline_at: new Date(requested.getTime() + SECTION_TIMEOUT_MS),
        reminded_at: r.reminded_at ? new Date(r.reminded_at) : null,
        timed_out_at: r.timed_out_at ? new Date(r.timed_out_at) : null,
        ready_at: r.ready_at ? new Date(r.ready_at) : null,
        accepted_at: r.accepted_at ? new Date(r.accepted_at) : null,
        accepted_version: r.accepted_version === null ? null : Number(r.accepted_version),
        quote_id: r.quote_id === null ? null : Number(r.quote_id),
        version: r.version === null ? null : Number(r.version),
      } as QuoteSection;
    });
}

/**
 * Tayyor bo'limlarga `ready_at` qo'yadi (birinchi marta). Fon ishi tayyor
 * bo'limni eslatma/muddat uchun qayta tekshirmasin.
 */
export async function markReady(sequelize: Sequelize, orderId: number, sections: QuoteSection[], t?: Transaction) {
  const ready = sections.filter((s) => s.state === 'ready').map((s) => s.store_id);
  if (!ready.length) return;
  await sequelize.query(
    `UPDATE order_quote_sections SET ready_at = now()
      WHERE order_id = :order AND store_id IN (:stores) AND ready_at IS NULL`,
    { replacements: { order: orderId, stores: ready }, transaction: t },
  );
}

/** API ko'rinishi (xaridorga do'kon NOMI berilmaydi — faqat id). */
export const publicSection = (s: QuoteSection) => ({
  store_id: s.store_id,
  state: s.state,
  item_count: s.item_count,
  unpriced_count: s.unpriced_count,
  requested_at: s.requested_at,
  deadline_at: s.deadline_at,
  accepted: s.accepted_at !== null,
  version: s.version,
  quote_id: s.quote_id,
});
