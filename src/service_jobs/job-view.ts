import { QueryTypes } from 'sequelize';
import { Courier } from 'src/deliveries/model/models';
import { HISTORY_MASK_AFTER_MS } from 'src/deliveries/constants';
import { maskAddress, maskPhone } from 'src/deliveries/deliveries.service';
import { workerLocationView } from 'src/deliveries/tracking.service';
import { decryptJobCode } from './job-code';
import { ServiceJob, ServiceJobEvent, ServiceReview } from './models';

/** Ishning xizmat qatorlari: nom, variant, soni, narx (javoblar uchun). */
export async function jobLines(job: ServiceJob) {
  if (!job.items?.length) return [];
  const rows: any[] = await ServiceJob.sequelize.query(
    `SELECT i.id, i.service_id, i.service_variant_id AS variant_id, i.for_order_item_id, i.quantity,
            i.price, i.price_type, i.visit_fee_uzs, i.product_model AS title,
            s.name_uz, s.name_ru, s.name_en, s.warranty_months,
            v.name_uz AS variant_uz, v.name_ru AS variant_ru, v.name_en AS variant_en,
            c.key AS category_key
       FROM "order-items" i
       LEFT JOIN services s ON s.id = i.service_id
       LEFT JOIN service_variants v ON v.id = i.service_variant_id
       LEFT JOIN service_categories c ON c.id = s.category_id
      WHERE i.id IN (:ids) ORDER BY i.id`,
    { replacements: { ids: job.items }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    order_item_id: Number(r.id),
    service_id: r.service_id === null ? null : Number(r.service_id),
    variant_id: r.variant_id === null ? null : Number(r.variant_id),
    for_order_item_id: r.for_order_item_id === null ? null : Number(r.for_order_item_id),
    category_key: r.category_key ?? null,
    // Katalogdagi nom o'zgarsa ham buyurtmadagi matn (`title`) qotib qolgan
    name: r.name_uz ?? r.title,
    name_ru: r.name_ru ?? null,
    name_en: r.name_en ?? null,
    variant: r.variant_uz ?? null,
    variant_ru: r.variant_ru ?? null,
    variant_en: r.variant_en ?? null,
    title: r.title,
    quantity: Number(r.quantity),
    price: r.price === null ? null : Number(r.price),
    price_type: r.price_type ?? null,
    visit_fee_uzs: r.visit_fee_uzs === null ? null : Number(r.visit_fee_uzs),
    warranty_months: r.warranty_months === null ? 0 : Number(r.warranty_months),
  }));
}

const FINISHED_AT = (j: any) => j.completed_at || j.failed_at || j.cancelled_at;

/** Orqa ofis (hamkor, superadmin): hammasi, kodning O'ZIDAN tashqari. */
export async function backofficeJobView(job: ServiceJob, opts: { full?: boolean } = {}) {
  const plain: any = { ...job.get({ plain: true }) };
  delete plain.proof_code_enc;
  plain.proof_code_set = !!job.proof_code_enc;
  plain.lines = await jobLines(job);
  if (job.worker_id) {
    const w = await Courier.findByPk(job.worker_id, {
      attributes: ['id', 'full_name', 'phone', 'skills', 'is_online', 'last_lat', 'last_lng', 'last_seen_at'],
    });
    plain.worker = w ? w.get({ plain: true }) : null;
  } else plain.worker = null;
  if (opts.full) {
    plain.events = await ServiceJobEvent.findAll({ where: { job_id: job.id }, order: [['id', 'ASC']] });
    plain.review = await ServiceReview.findOne({ where: { job_id: job.id } });
  }
  return plain;
}

/**
 * Usta ko'radigan shakl (7-band). Kod, urinishlar va komissiya YO'Q.
 * Yakunlangan ishda 24 soatdan keyin mijoz telefoni va aniq manzil
 * yashiriladi (№22 dagi qoida).
 */
export async function workerJobView(job: ServiceJob, opts: { full?: boolean } = {}) {
  const plain: any = { ...job.get({ plain: true }) };
  delete plain.proof_code_enc;
  delete plain.proof_code_attempts;
  delete plain.commission_percent;
  delete plain.cod_before_price;
  plain.type = 'job';
  const finishedAt = FINISHED_AT(plain);
  const masked = !!finishedAt && Date.now() - new Date(finishedAt).getTime() > HISTORY_MASK_AFTER_MS;
  if (masked) {
    plain.recipient_phone = maskPhone(plain.recipient_phone);
    plain.address = maskAddress(plain.address);
    plain.address_details = null;
    plain.lat = null;
    plain.lng = null;
    plain.recipient_name = plain.recipient_name ? String(plain.recipient_name).split(' ')[0] : null;
    plain.customer_photos = [];
    plain.comment = null;
  }
  plain.masked = masked;
  plain.lines = await jobLines(job);
  if (opts.full && !masked) {
    const [store]: any[] = await ServiceJob.sequelize.query('SELECT id, name, phone FROM stores WHERE id = :id', {
      replacements: { id: job.store_id },
      type: QueryTypes.SELECT,
    });
    plain.store = store ?? null;
  }
  return plain;
}

/**
 * Mijoz ko'radigan shakl — kuzatishda (8-band). Maxfiylik №24 bilan bir xil:
 *   - usta joylashuvi faqat `on_the_way` da;
 *   - ustaning faqat ismi; telefoni faqat `on_the_way` / `arrived` da;
 *   - `proof_code` — faqat buyurtma EGASIGA (chaqiruvchi tekshiradi) va faqat
 *     usta yo'lga chiqqandan ish tugagunicha.
 */
export async function customerJobView(job: ServiceJob) {
  const lines = await jobLines(job);
  let worker: any = null;
  let location: any = null;
  let eta: number | null = null;
  if (job.worker_id) {
    const c = await Courier.findByPk(job.worker_id, {
      attributes: ['full_name', 'phone', 'last_lat', 'last_lng', 'last_heading', 'last_seen_at'],
    });
    if (c) {
      worker = {
        first_name: String(c.full_name || '').trim().split(/\s+/)[0] || null,
        phone: ['on_the_way', 'arrived'].includes(job.status) ? c.phone : null,
      };
      if (job.status === 'on_the_way') {
        const loc = workerLocationView(c, { lat: job.lat, lng: job.lng });
        location = loc.location;
        eta = loc.eta_minutes;
      }
    }
  }
  const review = job.status === 'completed' ? await ServiceReview.findOne({ where: { job_id: job.id } }) : null;
  const codeVisible = ['on_the_way', 'arrived', 'in_progress'].includes(job.status);
  return {
    id: job.id,
    status: job.status,
    is_warranty: !!job.parent_job_id,
    services: lines.map((l) => ({
      name: l.name,
      name_ru: l.name_ru,
      name_en: l.name_en,
      variant: l.variant,
      variant_ru: l.variant_ru,
      variant_en: l.variant_en,
      quantity: l.quantity,
      price_type: l.price_type,
    })),
    scheduled: { from: job.scheduled_from, to: job.scheduled_to, status: job.schedule_status },
    worker,
    worker_location: location,
    eta_minutes: eta,
    proof_code: codeVisible ? decryptJobCode(job.proof_code_enc) : null,
    price: {
      quoted: job.quoted_amount,
      final: job.final_amount,
      final_status: job.final_amount_status,
      final_comment: job.final_amount_status === 'pending' ? job.final_amount_comment : null,
      visit_fee: job.visit_fee_uzs,
    },
    cod_amount: job.cod_amount,
    photos_after: job.status === 'completed' ? job.photos_after : [],
    warranty_until: job.warranty_until,
    review: review ? { rating: review.rating, comment: review.comment } : null,
    can_review: job.status === 'completed' && !review,
  };
}
