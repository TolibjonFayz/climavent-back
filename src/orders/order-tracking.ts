import { QueryTypes } from 'sequelize';
import { Delivery } from 'src/deliveries/model/models';
import { customerDeliveryView } from 'src/deliveries/tracking.service';
import { ServiceJob } from 'src/service_jobs/models';
import { customerJobView } from 'src/service_jobs/job-view';
import { OrderEvent } from './order-events';
import { storeStages } from './order-progress';

/**
 * Ilova ichida buyurtmani kuzatish — `GET /api/orders/:id/tracking`
 * (topshiriq №38, 2-band; №39, 8-band).
 *
 * Chaqiruvchi egalikni tekshirgan bo'lishi SHART (boshqa xaridor — 404).
 * Yetkazish qismi №24 dagi YAGONA funksiya (`customerDeliveryView`) bilan
 * chiziladi — maxfiylik qoidalari takrorlanmaydi. Kuryer, xodim va actor
 * ID lari javobga tushmaydi.
 */
export async function orderTracking(orderId: number) {
  const seq = Delivery.sequelize;
  const [order]: any[] = await seq.query(
    `SELECT id, status, kind, "createdAt" AS created_at FROM orders WHERE id = :id`,
    { replacements: { id: orderId }, type: QueryTypes.SELECT },
  );
  if (!order) return null;

  const items: any[] = await seq.query(
    `SELECT i.id, i.store_id, i.item_type, i.quantity, i.product_model AS model,
            COALESCE(p.name_uz, p.name_ru, p.name_en) AS name
       FROM "order-items" i LEFT JOIN products p ON p.id = i.product_id
      WHERE i.order_id = :id ORDER BY i.id`,
    { replacements: { id: orderId }, type: QueryTypes.SELECT },
  );
  const storeIds = [...new Set(items.map((i) => Number(i.store_id)).filter(Boolean))];
  const stores: any[] = storeIds.length
    ? await seq.query('SELECT id, name, phone FROM stores WHERE id IN (:ids)', {
        replacements: { ids: storeIds },
        type: QueryTypes.SELECT,
      })
    : [];
  const stages = new Map((await storeStages(seq, orderId)).map((s) => [s.store_id, s.stage]));
  const deliveries = await Delivery.findAll({ where: { order_id: orderId }, order: [['id', 'DESC']] });
  const jobs = await ServiceJob.findAll({ where: { order_id: orderId }, order: [['id', 'ASC']] });

  const parts = [];
  for (const storeId of storeIds) {
    const s = stores.find((x) => Number(x.id) === storeId);
    // Bir do'konda bir nechta yetkazish bo'lsa (`retry`) — faqat OXIRGI faoli
    const d = deliveries.find((x) => Number(x.store_id) === storeId && x.status !== 'cancelled') ?? null;
    parts.push({
      store: s ? { id: storeId, name: s.name, phone: s.phone ?? null } : { id: storeId, name: null, phone: null },
      // Faqat xizmat sotayotgan hamkor qismida yig'ish bosqichi yo'q
      stage: stages.get(storeId) ?? null,
      items: items
        .filter((i) => Number(i.store_id) === storeId && i.item_type !== 'service')
        .map((i) => ({ name: i.name, model: i.model, quantity: Number(i.quantity) })),
      delivery: d ? await customerDeliveryView(d) : null,
      jobs: await Promise.all(jobs.filter((j) => Number(j.store_id) === storeId).map((j) => customerJobView(j))),
    });
  }

  return {
    order_id: Number(order.id),
    status: order.status,
    steps: await orderSteps(order, items.some((i) => i.item_type !== 'service'), jobs.length > 0),
    parts,
  };
}

/**
 * Buyurtmaning umumiy bosqichlari. Vaqt — tarixdagi BIRINCHI kirish;
 * joriy holatdan keyingi bosqich `at: null` (masalan `ready -> packing`
 * qaytarilganda `ready` bo'shaydi). Faqat xizmatdan iborat buyurtmada
 * `packing` / `ready` / `shipping` yo'q (№39, 7-band).
 */
async function orderSteps(order: any, hasProducts: boolean, hasJobs: boolean) {
  const keys = ['created', ...(hasProducts ? ['packing', 'ready', 'shipping'] : []), ...(hasJobs ? ['in_progress'] : []), 'done'];
  const events = await OrderEvent.findAll({
    where: { order_id: order.id },
    attributes: ['event', 'to_status', 'created_at'],
    order: [['id', 'ASC']],
  });
  const first = (pred: (e: OrderEvent) => boolean) => events.find(pred)?.created_at ?? null;
  const at: Record<string, Date | null> = {
    created: first((e) => e.event === 'created') ?? order.created_at,
    packing: first((e) => e.event === 'status_changed' && e.to_status === 'packing'),
    ready: first((e) => e.event === 'status_changed' && e.to_status === 'ready'),
    shipping:
      first((e) => e.event === 'status_changed' && e.to_status === 'shipping') ?? first((e) => e.event === 'delivery_started'),
    in_progress:
      first((e) => e.event === 'status_changed' && e.to_status === 'in_progress') ?? first((e) => e.event === 'job_started'),
    done: first((e) => e.event === 'status_changed' && e.to_status === 'done'),
  };
  const current = keys.indexOf(order.status);
  const reached = order.status === 'cancelled' ? -1 : current;
  const steps: { key: string; at: Date | null }[] = keys.map((key, i) => ({
    key,
    // `new`/`paid`/`quote_sent` — faqat `created`; keyingi bosqich — hali yo'q
    at: i === 0 || (reached >= 0 && i <= reached) ? at[key] ?? null : null,
  }));
  if (order.status === 'cancelled') {
    // Bekor qilinishigacha o'tilgan bosqichlar vaqti saqlanadi
    for (const s of steps) s.at = s.key === 'created' ? s.at : at[s.key] ?? null;
    steps.push({
      key: 'cancelled',
      at: first((e) => e.event === 'status_changed' && e.to_status === 'cancelled') ?? first((e) => e.event === 'quote_rejected'),
    });
  }
  return steps;
}
