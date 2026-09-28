import { Logger } from '@nestjs/common';
import { QueryTypes, Sequelize, Transaction } from 'sequelize';
import { Courier } from 'src/deliveries/model/models';
import { recordCourierEvent } from 'src/deliveries/courier-events';
import { Crew } from './models';

/**
 * Ishonch darajalari va ish statistikasi — topshiriq №44, 2-band.
 *
 *   documents — pasport + selfi tasdiqlangan (`documents_verified_at`);
 *   skills    — + superadmin malakani tasdiqlagan (`verified_skills` bo'sh emas);
 *   top       — + reyting, ish soni, 90 kunlik kafolat va bekor qilish ulushi
 *               (`settings` dagi chegaralar), superadmin olib qo'ymagan.
 *
 * Brigada: `documents` — boshliq va hamma faol a'zolar hujjati tasdiqlangan.
 * Statistika sinov buyurtmalarisiz (№43, 2.4). Ish usta shaxsiga ham, brigadaga
 * ham yoziladi (a'zoga nusxa — keyin yakka ishlaganda tajribasi ko'rinsin).
 * Statik funksiyalar — DI sikli bo'lmasin (jobs.service ham chaqiradi).
 */
const logger = new Logger('Trust');

export interface TopRules {
  min_rating: number;
  min_jobs: number;
  max_warranty_share: number;
  max_cancel_share: number;
}

export async function settingNumber(seq: Sequelize, key: string, def: number): Promise<number> {
  try {
    const [row]: any[] = await seq.query('SELECT value FROM settings WHERE key = :key', {
      replacements: { key },
      type: QueryTypes.SELECT,
    });
    const n = Number(row?.value);
    return row && Number.isFinite(n) ? n : def;
  } catch {
    return def;
  }
}

export async function topRules(seq: Sequelize): Promise<TopRules> {
  return {
    min_rating: await settingNumber(seq, 'trust_top_min_rating', 4.8),
    min_jobs: await settingNumber(seq, 'trust_top_min_jobs', 20),
    max_warranty_share: await settingNumber(seq, 'trust_top_max_warranty_share', 0.05),
    max_cancel_share: await settingNumber(seq, 'trust_top_max_cancel_share', 0.05),
  };
}

/** Kuryer ishtirok etgan ish sharti (`j` taxallusi, `:cid`). */
const COURIER_JOB = `(j.worker_id = :cid OR j.performer_id = :cid
                      OR EXISTS (SELECT 1 FROM service_job_workers w WHERE w.job_id = j.id AND w.courier_id = :cid))`;
const CREW_JOB = `j.crew_id = :cid`;

async function statsOf(seq: Sequelize, cond: string, id: number, t?: Transaction) {
  const [s]: any[] = await seq.query(
    `SELECT
       (SELECT COUNT(*) FROM service_jobs j JOIN orders o ON o.id = j.order_id
         WHERE j.status = 'completed' AND NOT o.is_test AND ${cond})::int AS jobs_done,
       (SELECT ROUND(AVG(r.rating)::numeric, 2) FROM service_reviews r
          JOIN service_jobs j ON j.id = r.job_id JOIN orders o ON o.id = j.order_id
         WHERE NOT r.is_hidden AND NOT o.is_test AND ${cond}) AS rating,
       (SELECT COUNT(*) FROM service_reviews r
          JOIN service_jobs j ON j.id = r.job_id JOIN orders o ON o.id = j.order_id
         WHERE NOT r.is_hidden AND NOT o.is_test AND ${cond})::int AS reviews_count,
       -- 90 kun: yakunlangan ishlar va ularga kelgan kafolat murojaatlari
       (SELECT COUNT(*) FROM service_jobs j JOIN orders o ON o.id = j.order_id
         WHERE j.status = 'completed' AND NOT o.is_test AND j.completed_at >= now() - interval '90 days' AND ${cond})::int AS done_90,
       (SELECT COUNT(*) FROM service_jobs c JOIN service_jobs j ON j.id = c.parent_job_id
         WHERE c.created_at >= now() - interval '90 days' AND ${cond})::int AS warranty_90`,
    { replacements: { cid: id }, type: QueryTypes.SELECT, transaction: t },
  );
  return {
    jobs_done: Number(s.jobs_done),
    rating: s.rating === null ? null : Number(s.rating),
    reviews_count: Number(s.reviews_count),
    done_90: Number(s.done_90),
    warranty_90: Number(s.warranty_90),
  };
}

/** Kuryerning 90 kunlik bekor qilish (rad etish) ulushi: rad / (qabul + rad). */
async function cancelShare(seq: Sequelize, courierId: number) {
  const [s]: any[] = await seq.query(
    `SELECT
       (SELECT COUNT(*) FROM courier_events WHERE courier_id = :id AND event IN ('job_rejected', 'delivery_released')
           AND created_at >= now() - interval '90 days')::int AS rejected,
       ((SELECT COUNT(*) FROM service_jobs WHERE worker_id = :id AND accepted_at >= now() - interval '90 days')
        + (SELECT COUNT(*) FROM deliveries WHERE courier_id = :id AND accepted_at >= now() - interval '90 days'))::int AS accepted`,
    { replacements: { id: courierId }, type: QueryTypes.SELECT },
  );
  const total = Number(s.rejected) + Number(s.accepted);
  return total ? Number(s.rejected) / total : 0;
}

function level(input: {
  docs: boolean;
  verified: string[];
  revoked: boolean;
  stats: { rating: number | null; jobs_done: number; done_90: number; warranty_90: number };
  cancel: number;
  rules: TopRules;
}): string {
  if (!input.docs) return 'none';
  if (!input.verified?.length) return 'documents';
  const s = input.stats;
  const warranty = s.done_90 ? s.warranty_90 / s.done_90 : 0;
  const top =
    !input.revoked &&
    s.rating !== null &&
    s.rating >= input.rules.min_rating &&
    s.jobs_done >= input.rules.min_jobs &&
    warranty <= input.rules.max_warranty_share &&
    input.cancel <= input.rules.max_cancel_share;
  return top ? 'top' : 'skills';
}

const SYSTEM = { role: 'system', user_id: null, login: 'system' };

/**
 * Kuryer(lar)ning statistikasi va darajasini qayta hisoblaydi. Daraja o'zgarsa —
 * `courier_events.trust_changed` (kim, sabab). `actor` berilmasa — tizim.
 */
export async function refreshCourierTrust(
  ids: number[],
  opts: { actor?: { role?: string; user_id?: number | null; login?: string | null }; reason?: string } = {},
) {
  const seq = Courier.sequelize;
  const rules = await topRules(seq);
  const changes: { id: number; from: string; to: string }[] = [];
  for (const id of [...new Set(ids.filter(Boolean))]) {
    try {
      const c = await Courier.findByPk(id);
      if (!c) continue;
      const stats = await statsOf(seq, COURIER_JOB, id);
      const to = level({
        docs: !!c.documents_verified_at,
        verified: c.verified_skills,
        revoked: !!c.top_revoked_at,
        stats,
        cancel: await cancelShare(seq, id),
        rules,
      });
      const from = c.trust_level;
      await c.update({ jobs_done: stats.jobs_done, rating: stats.rating, reviews_count: stats.reviews_count, trust_level: to } as any, {
        silent: true,
      });
      if (from !== to) {
        changes.push({ id, from, to });
        await recordCourierEvent(id, 'trust_changed', opts.actor ?? SYSTEM, `${from} -> ${to}${opts.reason ? ` (${opts.reason})` : ''}`);
      }
    } catch (e) {
      logger.error(`Kuryer #${id} darajasi hisoblanmadi: ${(e as Error).message}`);
    }
  }
  return changes;
}

export async function refreshCrewTrust(
  ids: number[],
  opts: { actor?: { role?: string; user_id?: number | null; login?: string | null }; reason?: string } = {},
) {
  const seq = Crew.sequelize;
  const rules = await topRules(seq);
  const changes: { id: number; from: string; to: string }[] = [];
  for (const id of [...new Set(ids.filter(Boolean))]) {
    try {
      const crew = await Crew.findByPk(id);
      if (!crew) continue;
      const [docs]: any[] = await seq.query(
        `SELECT bool_and(c.documents_verified_at IS NOT NULL) AS ok FROM couriers c
          WHERE c.id = :leader OR c.id IN (SELECT courier_id FROM crew_members WHERE crew_id = :id AND left_at IS NULL)`,
        { replacements: { id, leader: crew.leader_courier_id }, type: QueryTypes.SELECT },
      );
      const stats = await statsOf(seq, CREW_JOB, id);
      const to = level({
        docs: !!docs?.ok,
        verified: crew.verified_skills,
        revoked: !!crew.top_revoked_at,
        stats,
        // Brigadani boshliq qabul qiladi/rad etadi — uning ulushi
        cancel: await cancelShare(seq, crew.leader_courier_id),
        rules,
      });
      const from = crew.trust_level;
      await crew.update({ jobs_done: stats.jobs_done, rating: stats.rating, reviews_count: stats.reviews_count, trust_level: to } as any, {
        silent: true,
      });
      if (from !== to) {
        changes.push({ id, from, to });
        await recordCourierEvent(
          crew.leader_courier_id,
          'trust_changed',
          opts.actor ?? SYSTEM,
          `Brigada #${id}: ${from} -> ${to}${opts.reason ? ` (${opts.reason})` : ''}`,
        );
      }
    } catch (e) {
      logger.error(`Brigada #${id} darajasi hisoblanmadi: ${(e as Error).message}`);
    }
  }
  return changes;
}

/** Ish yakunlanganda / baho qo'yilganda: ijrochilar va brigada statistikasi. */
export async function refreshJobPeople(jobId: number) {
  try {
    const seq = Courier.sequelize;
    const [j]: any[] = await seq.query(
      `SELECT worker_id, performer_id, crew_id,
              ARRAY(SELECT courier_id FROM service_job_workers WHERE job_id = :id) AS executors
         FROM service_jobs WHERE id = :id`,
      { replacements: { id: jobId }, type: QueryTypes.SELECT },
    );
    if (!j) return;
    await refreshCourierTrust([j.worker_id, j.performer_id, ...(j.executors || [])].map(Number).filter(Boolean));
    if (j.crew_id) await refreshCrewTrust([Number(j.crew_id)]);
  } catch (e) {
    logger.error(`Ish #${jobId} statistikasi yangilanmadi: ${(e as Error).message}`);
  }
}

/** Kunlik fon ishi: hamma faol kuryer va brigada. */
export async function refreshAllTrust() {
  const seq = Courier.sequelize;
  const couriers: any[] = await seq.query(`SELECT id FROM couriers WHERE is_active`, { type: QueryTypes.SELECT });
  const crews: any[] = await seq.query(`SELECT id FROM crews WHERE is_active`, { type: QueryTypes.SELECT });
  const a = await refreshCourierTrust(couriers.map((r) => Number(r.id)));
  const b = await refreshCrewTrust(crews.map((r) => Number(r.id)));
  return { couriers: a, crews: b };
}

/** Xaridorga ko'rinadigan ishonch bloki (pasport, telefon, familiya — yo'q). */
export function trustView(x: { trust_level?: string | null; verified_skills?: string[] | null; rating?: number | null; jobs_done?: number | null }) {
  return {
    trust_level: x.trust_level ?? 'none',
    verified_skills: x.verified_skills ?? [],
    rating: x.rating === null || x.rating === undefined ? null : Number(x.rating),
    jobs_done: Number(x.jobs_done || 0),
  };
}
