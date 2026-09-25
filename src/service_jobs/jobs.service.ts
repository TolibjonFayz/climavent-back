import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Op, QueryTypes, Transaction } from 'sequelize';
import type { StoreRequester } from 'src/store_auth/store_auth.guard';
import { Courier, Delivery } from 'src/deliveries/model/models';
import { orderOwnerId } from 'src/deliveries/customer-push';
import { firstName } from 'src/deliveries/deliveries.service';
import { workerLocationView } from 'src/deliveries/tracking.service';
import { OrderActorType, OrderEventName, recordOrderEvent } from 'src/orders/order-events';
import { syncOrderStatus } from 'src/orders/order-progress';
import { decryptJobCode, encryptJobCode, newJobCode } from './job-code';
import {
  CUSTOMER_PHOTOS_MAX,
  JOB_ACTIVE,
  JOB_CODE_MAX_ATTEMPTS,
  JOB_CUSTOMER_CANCEL_FROM,
  JOB_HISTORY,
  JOB_STATUS_TIME,
  JOB_TRANSITIONS,
  JobStatus,
  ServiceJob,
  ServiceJobEvent,
  ServiceReview,
  WORKER_PHOTOS_MAX,
} from './models';
import { backofficeJobView, customerJobView, jobLines, workerJobView } from './job-view';
import { assertOwnPhotoUrls } from './service-orders';
import {
  pushJobCompleted,
  pushJobPriceChange,
  pushJobRescheduled,
  pushJobScheduleConfirmed,
  pushStoreJobProblem,
  pushStoreScheduleAnswer,
  pushStoreWarrantyClaim,
  pushWorker,
  pushWorkerArrived,
  pushWorkerOnTheWay,
} from './job-push';
import {
  GeoDto,
  JobBeginDto,
  JobCompleteDto,
  JobFailDto,
  JobPriceDto,
  JobScheduleDto,
  ReviewDto,
  UpdateJobDto,
  WarrantyClaimDto,
} from './dto';

export interface JobActor {
  type: OrderActorType;
  id: number | null;
}

const backofficeActor = (r: StoreRequester): JobActor => ({
  type: r?.role === 'superadmin' ? 'superadmin' : 'store',
  id: r?.user_id ?? null,
});
const workerActor = (w: Courier): JobActor => ({ type: 'courier', id: w.store_user_id });

/** Ish amali buyurtma tarixida qanday ko'rinadi (№25 dagi yetkazish kabi). */
const ORDER_EVENT_OF: Partial<Record<string, OrderEventName>> = {
  assign: 'job_assigned',
  start: 'job_started',
  complete: 'job_completed',
  fail: 'job_failed',
  cancel: 'job_cancelled',
};

const FAILURE_TEXT: Record<string, string> = {
  client_unreachable: 'Mijoz javob bermadi',
  client_refused: 'Mijoz rad etdi',
  wrong_address: "Manzil noto'g'ri",
  not_possible: 'Texnik imkonsiz',
  other: 'Boshqa sabab',
};

/**
 * Xizmat ishlari — topshiriq №39, 5- va 7-band. Yetkazishning (№22) egizagi:
 * holatlar mashinasi, tarix, kod, naqd, joylashuv bir xil qoidalar bilan.
 *
 * Kim nima qiladi:
 *   hamkor (admin / `jobs.edit` xodimi), superadmin — biriktirish, vaqt,
 *     bekor qilish, qayta tashrif, (ilovasiz mijoz uchun) narxni tasdiqlash;
 *   usta — FAQAT O'ZIGA biriktirilgan ish (boshqasi 404);
 *   mijoz — o'z buyurtmasidagi ish: vaqt/narxni tasdiqlash, bekor, baho, kafolat.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private isSuper = (r: StoreRequester) => r?.role === 'superadmin';

  // ============================================================ HAMKOR
  private async loadScoped(id: number, r: StoreRequester, t?: Transaction, lock = false) {
    const j = await ServiceJob.findByPk(id, { transaction: t, ...(lock && t ? { lock: t.LOCK.UPDATE } : {}) });
    if (!j || (!this.isSuper(r) && Number(j.store_id) !== Number(r.store_id))) {
      throw new NotFoundException('Ish topilmadi');
    }
    return j;
  }

  async list(
    r: StoreRequester,
    q: { status?: string; store_id?: string; worker_id?: string; order_id?: string; date_from?: string; date_to?: string; page?: string; limit?: string },
  ) {
    const where: any = {};
    if (!this.isSuper(r)) where.store_id = r.store_id;
    else if (q.store_id && /^\d+$/.test(q.store_id)) where.store_id = Number(q.store_id);
    if (q.status) where.status = { [Op.in]: q.status.split(',').map((s) => s.trim()) };
    if (q.worker_id) where.worker_id = q.worker_id === 'null' ? null : Number(q.worker_id);
    if (q.order_id && /^\d+$/.test(q.order_id)) where.order_id = Number(q.order_id);
    // Sana — kelishilgan vaqt bo'yicha (jadval), bo'lmasa yaratilgan vaqt
    const and: any[] = [];
    const seq = ServiceJob.sequelize;
    if (q.date_from && !isNaN(Date.parse(q.date_from))) {
      and.push(seq.where(seq.fn('COALESCE', seq.col('scheduled_from'), seq.col('created_at')), Op.gte, new Date(q.date_from)));
    }
    if (q.date_to && !isNaN(Date.parse(q.date_to))) {
      and.push(seq.where(seq.fn('COALESCE', seq.col('scheduled_from'), seq.col('created_at')), Op.lte, new Date(q.date_to)));
    }
    if (and.length) where[Op.and] = and;
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const page = Math.max(Number(q.page) || 1, 1);
    const { rows, count } = await ServiceJob.findAndCountAll({
      where,
      order: [['scheduled_from', 'ASC NULLS LAST'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    return { rows: await Promise.all(rows.map((j) => backofficeJobView(j))), total: count, page, limit };
  }

  async getOne(id: number, r: StoreRequester) {
    return backofficeJobView(await this.loadScoped(id, r), { full: true });
  }

  /** Buyurtmaning ishlari (`GET /orders/:id` uchun). */
  async forOrder(orderId: number, storeId: number | null) {
    const rows = await ServiceJob.findAll({
      where: { order_id: orderId, ...(storeId ? { store_id: storeId } : {}) },
      order: [['id', 'ASC']],
    });
    return Promise.all(rows.map((j) => backofficeJobView(j)));
  }

  async update(id: number, dto: UpdateJobDto, r: StoreRequester) {
    const j = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.loadScoped(id, r, t, true);
      if (!['pending', 'assigned', 'accepted'].includes(j.status)) {
        throw new ConflictException(`${j.status} holatida o'zgartirib bo'lmaydi`);
      }
      const payload: any = {};
      if (dto.cod_amount !== undefined) payload.cod_amount = dto.cod_amount;
      if (dto.delivery_id !== undefined) {
        if (dto.delivery_id !== null) {
          const d = await Delivery.findByPk(dto.delivery_id, { transaction: t });
          if (!d || Number(d.order_id) !== Number(j.order_id) || Number(d.store_id) !== Number(j.store_id)) {
            throw new BadRequestException("delivery_id: shu buyurtma va shu hamkorning yetkazishi emas");
          }
          if (['cancelled', 'returned'].includes(d.status)) throw new ConflictException('Yetkazish bekor qilingan');
        }
        payload.delivery_id = dto.delivery_id;
      }
      if (!Object.keys(payload).length) return j;
      await j.update(payload, { transaction: t });
      await this.event(j.id, j.status, j.status, backofficeActor(r), {}, `O'zgartirildi: ${Object.keys(payload).join(', ')}`, t, 'updated');
      return j;
    });
    return backofficeJobView(j);
  }

  /**
   * Ustani biriktirish (5-band): usta faol, `skills` da ishning HAMMA turi bor,
   * usta shu hamkorniki (yoki platformaniki va superadmin biriktiryapti).
   */
  async assign(id: number, workerId: number, r: StoreRequester) {
    const { job, previous } = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.loadScoped(id, r, t, true);
      const w = await Courier.findByPk(workerId, { transaction: t });
      if (!w) throw new NotFoundException('Usta topilmadi');
      if (!this.isSuper(r)) {
        if (w.store_id === null) throw new ForbiddenException('Platforma ustasini faqat superadmin biriktiradi');
        if (Number(w.store_id) !== Number(r.store_id)) throw new ForbiddenException("Bu usta boshqa hamkorga tegishli");
      }
      if (w.store_id !== null && Number(w.store_id) !== Number(j.store_id)) {
        throw new ForbiddenException("Hamkor ustasi faqat o'z hamkori ishiga biriktiriladi");
      }
      if (!w.is_active) throw new ConflictException('Usta faol emas');
      const needed = [...new Set((await jobLines(j)).map((l) => l.category_key).filter(Boolean))] as string[];
      const missing = needed.filter((k) => !(w.skills || []).includes(k));
      if (missing.length) throw new ConflictException(`Ustada kerakli ko'nikma yo'q: ${missing.join(', ')}`);
      const previous = j.worker_id;
      await this.apply(j, 'assign', backofficeActor(r), { worker_id: w.id }, {}, `Usta: ${w.full_name}`, t);
      return { job: j, previous };
    });
    if (previous && previous !== job.worker_id) {
      await pushWorker(previous, job.order_id, job.id, 'job_unassigned', "Ish olib qo'yildi", `#${job.id} boshqa ustaga berildi`);
    }
    await pushWorker(
      job.worker_id,
      job.order_id,
      job.id,
      'job_assigned',
      'Yangi ish',
      `#${job.id}: ${job.address || ''}${job.scheduled_from ? ` · ${fmt(job.scheduled_from)}` : ''}`,
    );
    return backofficeJobView(job);
  }

  /**
   * Vaqtni kelishish (5-band):
   *   - `from/to` berilmasa yoki mijoz taklifiga teng — `confirmed`;
   *   - boshqa vaqt — `rescheduled` (mijoz ilovada tasdiqlaydi);
   *   - `agreed: true` — mijoz bilan chat/telefonda kelishilgan, darhol `confirmed`.
   */
  async schedule(id: number, dto: JobScheduleDto, r: StoreRequester) {
    const before = await this.loadScoped(id, r);
    const res = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.loadScoped(id, r, t, true);
      if (!['pending', 'assigned', 'accepted'].includes(j.status)) {
        throw new ConflictException(`${j.status} holatida vaqtni o'zgartirib bo'lmaydi`);
      }
      const from = dto.from ? new Date(dto.from) : j.scheduled_from;
      const to = dto.to ? new Date(dto.to) : dto.from ? null : j.scheduled_to;
      if (!from) throw new BadRequestException('Vaqt yo\'q: from (va to) yuboring');
      if (to && to.getTime() <= from.getTime()) throw new BadRequestException("to from dan keyin bo'lsin");
      const same =
        j.schedule_status === 'proposed' &&
        j.scheduled_from &&
        new Date(j.scheduled_from).getTime() === from.getTime() &&
        (!to || !j.scheduled_to || new Date(j.scheduled_to).getTime() === to.getTime());
      const status = dto.agreed || same || (!dto.from && !dto.to) ? 'confirmed' : 'rescheduled';
      await j.update({ scheduled_from: from, scheduled_to: to, schedule_status: status } as any, { transaction: t });
      await this.event(
        j.id, j.status, j.status, backofficeActor(r), {},
        [status === 'confirmed' ? 'Vaqt tasdiqlandi' : 'Boshqa vaqt taklif qilindi', dto.agreed ? '(mijoz bilan kelishilgan)' : null, dto.comment]
          .filter(Boolean)
          .join(' '),
        t,
        status === 'confirmed' ? 'schedule_confirmed' : 'schedule_rescheduled',
      );
      await recordOrderEvent({
        order_id: j.order_id,
        store_id: j.store_id,
        event: 'job_rescheduled',
        actor_type: backofficeActor(r).type,
        actor_id: r?.user_id ?? null,
        note: `Ish #${j.id}: ${status} ${fmt(from)}`,
        transaction: t,
      });
      return j;
    });
    const userId = await orderOwnerId(res.order_id);
    if (res.schedule_status === 'confirmed') await pushJobScheduleConfirmed(res.order_id, res.id, userId, res.scheduled_from);
    else await pushJobRescheduled(res.order_id, res.id, userId, res.scheduled_from);
    const moved = !before.scheduled_from || new Date(before.scheduled_from).getTime() !== new Date(res.scheduled_from).getTime();
    if (res.worker_id && moved) {
      await pushWorker(res.worker_id, res.order_id, res.id, 'job_rescheduled', "Ish vaqti o'zgardi", `#${res.id}: ${fmt(res.scheduled_from)}`);
    }
    return backofficeJobView(res);
  }

  async cancel(id: number, comment: string | undefined, r: StoreRequester) {
    const j = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.loadScoped(id, r, t, true);
      await this.apply(j, 'cancel', backofficeActor(r), {}, {}, comment || null, t);
      return j;
    });
    await pushWorker(j.worker_id, j.order_id, j.id, 'job_cancelled', 'Ish bekor qilindi', `#${j.id}`);
    await syncOrderStatus(ServiceJob.sequelize, j.order_id, { note: `Ish #${j.id} bekor qilindi` });
    return backofficeJobView(j);
  }

  /** Qayta tashrif (`failed -> pending`): yangi usta, yangi kod, narx taklifi tozalanadi. */
  async retry(id: number, r: StoreRequester) {
    const j = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.loadScoped(id, r, t, true);
      await this.apply(
        j,
        'retry',
        backofficeActor(r),
        {
          worker_id: null,
          proof_code_enc: null,
          proof_code_attempts: 0,
          failure_reason: null,
          failure_comment: null,
          failure_photo: null,
          final_amount: null,
          final_amount_status: null,
          final_amount_comment: null,
          final_amount_photos: [],
          ...(j.cod_before_price !== null ? { cod_amount: j.cod_before_price, cod_before_price: null } : {}),
          cash_collected: null,
          schedule_status: j.schedule_status === 'confirmed' ? 'proposed' : j.schedule_status,
          started_at: null,
          arrived_at: null,
          work_started_at: null,
          failed_at: null,
        },
        {},
        'Qayta tashrif',
        t,
      );
      return j;
    });
    return backofficeJobView(j);
  }

  /** Ilovasi yo'q mijoz uchun: hamkor telefonda kelishib narxni tasdiqlaydi/rad etadi. Izoh MAJBURIY. */
  async storePriceAnswer(id: number, accept: boolean, comment: string | undefined, r: StoreRequester) {
    if (!comment?.trim()) throw new BadRequestException('comment majburiy: mijoz bilan qanday kelishilgani');
    await this.loadScoped(id, r);
    return this.answerPrice(id, accept, backofficeActor(r), comment.trim(), (j) => this.assertScoped(j, r));
  }

  private assertScoped(j: ServiceJob, r: StoreRequester) {
    if (!this.isSuper(r) && Number(j.store_id) !== Number(r.store_id)) throw new NotFoundException('Ish topilmadi');
  }

  // ============================================================ USTA
  async workerGet(w: Courier, id: number, t?: Transaction, lock = false) {
    const j = await ServiceJob.findByPk(id, { transaction: t, ...(lock && t ? { lock: t.LOCK.UPDATE } : {}) });
    if (!j || Number(j.worker_id) !== Number(w.id)) throw new NotFoundException('Ish topilmadi');
    return j;
  }

  async workerList(w: Courier, scope: 'active' | 'history') {
    const rows = await ServiceJob.findAll({
      where: { worker_id: w.id, status: { [Op.in]: scope === 'history' ? JOB_HISTORY : JOB_ACTIVE } },
      order: scope === 'history' ? [['updated_at', 'DESC']] : [['scheduled_from', 'ASC NULLS LAST'], ['id', 'ASC']],
      limit: scope === 'history' ? 100 : 200,
    });
    return Promise.all(rows.map((j) => workerJobView(j)));
  }

  async workerOne(w: Courier, id: number) {
    return workerJobView(await this.workerGet(w, id), { full: true });
  }

  async workerAccept(w: Courier, id: number, geo: GeoDto) {
    const j = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.workerGet(w, id, t, true);
      await this.apply(j, 'accept', workerActor(w), {}, geo, null, t);
      return j;
    });
    await this.touch(w, geo);
    return workerJobView(j);
  }

  async workerReject(w: Courier, id: number, comment: string, geo: GeoDto) {
    const j = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.workerGet(w, id, t, true);
      await this.apply(j, 'reject', workerActor(w), { worker_id: null }, geo, comment, t);
      return j;
    });
    await this.touch(w, geo);
    await pushStoreJobProblem(j.order_id, j.id, j.store_id, `${firstName(w.full_name)} rad etdi: ${comment}`);
    return { id: j.id, status: j.status };
  }

  /** Yo'lga chiqish: vaqt `confirmed` bo'lishi SHART (aks holda 409). Kod shu yerda tug'iladi. */
  async workerStart(w: Courier, id: number, geo: GeoDto) {
    const j = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.workerGet(w, id, t, true);
      if (j.status === 'accepted' && j.schedule_status !== 'confirmed') {
        throw new ConflictException("Vaqt hali tasdiqlanmagan — hamkor mijoz bilan kelishsin");
      }
      const [order]: any[] = await ServiceJob.sequelize.query('SELECT kind FROM orders WHERE id = :id', {
        replacements: { id: j.order_id },
        type: QueryTypes.SELECT,
        transaction: t,
      });
      if (order?.kind === 'quote') throw new ConflictException("KP hali qabul qilinmagan — narx kelishilmagan");
      await this.apply(j, 'start', workerActor(w), { proof_code_enc: encryptJobCode(newJobCode()), proof_code_attempts: 0 }, geo, null, t);
      return j;
    });
    await this.touch(w, geo);
    await syncOrderStatus(ServiceJob.sequelize, j.order_id, { actor_type: 'courier', actor_id: w.store_user_id, note: `Ish #${j.id}: usta yo'lda` });
    const fresh = await Courier.findByPk(w.id);
    const eta = fresh ? workerLocationView(fresh, { lat: j.lat, lng: j.lng }).eta_minutes : null;
    await pushWorkerOnTheWay(j.order_id, j.id, await orderOwnerId(j.order_id), firstName(w.full_name), eta);
    return workerJobView(j);
  }

  async workerArrive(w: Courier, id: number, geo: GeoDto) {
    const j = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.workerGet(w, id, t, true);
      await this.apply(j, 'arrive', workerActor(w), {}, geo, 'Manzilga yetib keldi', t);
      return j;
    });
    await this.touch(w, geo);
    await pushWorkerArrived(j.order_id, j.id, await orderOwnerId(j.order_id));
    return workerJobView(j);
  }

  /** Ishni boshlash: kamida 1 ta "oldin" rasmi; tovar shu yetkazish bilan kelsa — u `delivered` bo'lsin. */
  async workerBegin(w: Courier, id: number, dto: JobBeginDto) {
    const photos = assertOwnPhotoUrls(dto.photos_before, WORKER_PHOTOS_MAX, 'photos_before');
    if (!photos.length) throw new BadRequestException('Kamida 1 ta "oldin" rasmi majburiy (photos_before)');
    const j = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.workerGet(w, id, t, true);
      if (j.delivery_id) {
        const d = await Delivery.findByPk(j.delivery_id, { transaction: t });
        if (d && d.status !== 'delivered') {
          throw new ConflictException(`Tovar hali topshirilmagan (yetkazish #${d.id}: ${d.status})`);
        }
      }
      await this.apply(j, 'begin', workerActor(w), { photos_before: photos }, dto, null, t);
      return j;
    });
    await this.touch(w, dto);
    await syncOrderStatus(ServiceJob.sequelize, j.order_id, { actor_type: 'courier', actor_id: w.store_user_id });
    return workerJobView(j);
  }

  /**
   * Narx o'zgarishi (5-band): faqat `from` narxli xizmatda, `arrived` /
   * `in_progress` da. Narx faqat MIJOZ ROZILIGI bilan o'zgaradi.
   */
  async workerPrice(w: Courier, id: number, dto: JobPriceDto) {
    const photos = assertOwnPhotoUrls(dto.photos, WORKER_PHOTOS_MAX);
    const j = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.workerGet(w, id, t, true);
      if (!['arrived', 'in_progress'].includes(j.status)) {
        throw new ConflictException(`${j.status} holatida narxni o'zgartirib bo'lmaydi (arrived yoki in_progress)`);
      }
      const lines = await jobLines(j);
      if (!lines.some((l) => l.price_type === 'from')) {
        throw new ConflictException("Narx faqat \"…dan\" (from) narxli xizmatda o'zgaradi");
      }
      await j.update(
        {
          final_amount: dto.amount,
          final_amount_status: 'pending',
          final_amount_comment: dto.comment.trim(),
          final_amount_photos: photos,
          cod_before_price: j.cod_before_price ?? j.cod_amount,
        } as any,
        { transaction: t },
      );
      await this.event(j.id, j.status, j.status, workerActor(w), dto, `Yangi narx: ${dto.amount} — ${dto.comment.trim()}`, t, 'price_proposed');
      await recordOrderEvent({
        order_id: j.order_id,
        store_id: j.store_id,
        event: 'job_price_changed',
        actor_type: 'courier',
        actor_id: w.store_user_id,
        note: `Ish #${j.id}: ${j.quoted_amount ?? '—'} -> ${dto.amount} (mijoz tasdig'i kutilmoqda)`,
        transaction: t,
      });
      return j;
    });
    await this.touch(w, dto);
    await pushJobPriceChange(j.order_id, j.id, await orderOwnerId(j.order_id), dto.amount);
    return workerJobView(j);
  }

  /**
   * Ishni topshirish: kod YOKI ("keyin" rasmi + izoh). Narx tasdig'i
   * kutilayotgan bo'lsa — 409. Kod 5 marta xato — blok (№22 bilan bir xil).
   */
  async workerComplete(w: Courier, id: number, dto: JobCompleteDto) {
    const photos = assertOwnPhotoUrls(dto.photos_after, WORKER_PHOTOS_MAX, 'photos_after');
    const pre = await this.workerGet(w, id);
    if (!JOB_TRANSITIONS.complete.from.includes(pre.status as JobStatus)) {
      throw new ConflictException(`${pre.status} dan completed ga o'tib bo'lmaydi`);
    }
    if (pre.final_amount_status === 'pending') throw new ConflictException("Mijoz yangi narxni hali tasdiqlamagan");
    if (pre.final_amount_status === 'rejected') {
      throw new ConflictException("Mijoz yangi narxni rad etgan — ishni fail (client_refused) qiling yoki yangi narx yuboring");
    }
    if (!dto.code && !(photos.length && dto.comment?.trim())) {
      throw new BadRequestException('Mijoz kodi yoki "keyin" rasmi bilan izoh majburiy');
    }
    if (pre.cod_amount > 0) {
      if (dto.cash_collected === undefined || dto.cash_collected === null) {
        throw new BadRequestException(`cash_collected majburiy: mijozdan ${pre.cod_amount} so'm olinishi kerak`);
      }
      if (Number(dto.cash_collected) !== Number(pre.cod_amount) && !dto.comment?.trim()) {
        throw new BadRequestException(`Olingan summa ${pre.cod_amount} dan farq qiladi — izoh majburiy`);
      }
    }
    if (dto.code) {
      const res = await ServiceJob.sequelize.transaction(async (t) => {
        const j = await this.workerGet(w, id, t, true);
        if (j.proof_code_attempts >= JOB_CODE_MAX_ATTEMPTS) return 'blocked';
        const ok = decryptJobCode(j.proof_code_enc) === dto.code;
        if (!ok) {
          await j.update({ proof_code_attempts: j.proof_code_attempts + 1 }, { transaction: t });
          return `wrong:${JOB_CODE_MAX_ATTEMPTS - j.proof_code_attempts}`;
        }
        return 'ok';
      });
      if (res === 'wrong:0') throw new BadRequestException('Kod xato — kod bloklandi, endi "keyin" rasmi va izoh bilan topshiring');
      if (res === 'blocked') {
        throw new HttpException('Kod 5 marta noto\'g\'ri kiritildi va bloklandi — rasm va izoh bilan topshiring', HttpStatus.TOO_MANY_REQUESTS);
      }
      if (res !== 'ok') throw new BadRequestException(`Kod xato (qolgan urinish: ${res.split(':')[1]})`);
    }

    const j = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.workerGet(w, id, t, true);
      const months = Math.max(0, ...(await jobLines(j)).map((l) => l.warranty_months || 0));
      const now = new Date();
      const until = months ? addMonths(now, months) : null;
      await this.apply(
        j,
        'complete',
        workerActor(w),
        {
          photos_after: photos,
          cash_collected: j.cod_amount > 0 ? Number(dto.cash_collected) : dto.cash_collected ?? null,
          proof_comment: dto.comment?.trim() || null,
          warranty_until: until,
        },
        dto,
        [dto.code ? 'Kod bilan' : 'Rasm bilan', dto.comment?.trim()].filter(Boolean).join(': '),
        t,
      );
      await ServiceJob.sequelize.query('UPDATE stores SET jobs_done = jobs_done + 1 WHERE id = :id', {
        replacements: { id: j.store_id },
        transaction: t,
      });
      return j;
    });
    await this.touch(w, dto);
    await syncOrderStatus(ServiceJob.sequelize, j.order_id, { actor_type: 'courier', actor_id: w.store_user_id, note: `Ish #${j.id} bajarildi` });
    await pushJobCompleted(j.order_id, j.id, await orderOwnerId(j.order_id));
    return workerJobView(j);
  }

  async workerFail(w: Courier, id: number, dto: JobFailDto) {
    const photo = dto.photo ? assertOwnPhotoUrls([dto.photo], 1, 'photo')[0] : null;
    const j = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.workerGet(w, id, t, true);
      await this.apply(
        j,
        'fail',
        workerActor(w),
        {
          failure_reason: dto.failure_reason,
          failure_comment: dto.failure_comment?.trim() || null,
          failure_photo: photo,
          cash_collected: dto.cash_collected ?? null,
        },
        dto,
        [FAILURE_TEXT[dto.failure_reason] || dto.failure_reason, dto.failure_comment?.trim()].filter(Boolean).join(': '),
        t,
      );
      return j;
    });
    await this.touch(w, dto);
    await syncOrderStatus(ServiceJob.sequelize, j.order_id, { actor_type: 'courier', actor_id: w.store_user_id });
    await pushStoreJobProblem(
      j.order_id,
      j.id,
      j.store_id,
      `${FAILURE_TEXT[dto.failure_reason] || dto.failure_reason}${dto.failure_comment ? ` — ${dto.failure_comment}` : ''}`,
    );
    return workerJobView(j);
  }

  // ============================================================ MIJOZ
  /** Mijozning ishi: buyurtma egasi (yoki sayt admini); begona — 404. */
  private async customerJob(orderId: number, jobId: number, user: { id?: number; is_admin?: boolean }, t?: Transaction) {
    const j = await ServiceJob.findByPk(jobId, { transaction: t, ...(t ? { lock: t.LOCK.UPDATE } : {}) });
    if (!j || Number(j.order_id) !== Number(orderId)) throw new NotFoundException('Ish topilmadi');
    const owner = await orderOwnerId(orderId);
    if (!user?.is_admin && Number(owner) !== Number(user?.id)) throw new NotFoundException('Ish topilmadi');
    return j;
  }

  async customerJobs(orderId: number) {
    const rows = await ServiceJob.findAll({ where: { order_id: orderId }, order: [['id', 'ASC']] });
    return Promise.all(rows.map((j) => customerJobView(j)));
  }

  /** Hamkor boshqa vaqt taklif qilgan (`rescheduled`) — mijoz tasdiqlaydi yoki rad etadi. */
  async customerSchedule(orderId: number, jobId: number, accept: boolean, user: { id?: number; is_admin?: boolean }) {
    const j = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.customerJob(orderId, jobId, user, t);
      if (j.schedule_status !== 'rescheduled') {
        throw new ConflictException("Tasdiqlanadigan yangi vaqt yo'q (hamkor boshqa vaqt taklif qilmagan)");
      }
      // Rad etilsa — mijozning asl taklifi qaytadi, hamkor uni tasdiqlaydi yoki chatda kelishadi
      const payload: any = accept
        ? { schedule_status: 'confirmed' }
        : { schedule_status: 'proposed', scheduled_from: j.customer_from, scheduled_to: j.customer_to };
      await j.update(payload, { transaction: t });
      await this.event(
        j.id, j.status, j.status, { type: 'customer', id: user?.id ?? null }, {},
        accept ? 'Mijoz yangi vaqtni tasdiqladi' : 'Mijoz yangi vaqtni rad etdi',
        t,
        accept ? 'schedule_accepted' : 'schedule_rejected',
      );
      await recordOrderEvent({
        order_id: j.order_id,
        store_id: j.store_id,
        event: 'job_rescheduled',
        actor_type: 'customer',
        actor_id: user?.id ?? null,
        note: `Ish #${j.id}: vaqt ${accept ? 'tasdiqlandi' : 'rad etildi'}`,
        transaction: t,
      });
      return j;
    });
    await pushStoreScheduleAnswer(j.order_id, j.id, j.store_id, accept);
    return customerJobView(j);
  }

  async customerPrice(orderId: number, jobId: number, accept: boolean, user: { id?: number; is_admin?: boolean }) {
    await this.customerJob(orderId, jobId, user);
    return this.answerPrice(jobId, accept, { type: 'customer', id: user?.id ?? null }, null, () => undefined, true);
  }

  /**
   * Narxga javob (mijoz yoki uning nomidan hamkor):
   *   qabul — `accepted`, naqd yangi summaga moslashadi (oldindan to'langan qism saqlanadi);
   *   rad   — `rejected`, mijoz faqat chiqish haqini to'laydi (`cod_amount` shunga tushadi).
   */
  private async answerPrice(
    jobId: number,
    accept: boolean,
    actor: JobActor,
    comment: string | null,
    check: (j: ServiceJob) => void,
    customerView = false,
  ) {
    const j = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await ServiceJob.findByPk(jobId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!j) throw new NotFoundException('Ish topilmadi');
      check(j);
      if (j.final_amount_status !== 'pending') throw new ConflictException("Tasdiqlanadigan yangi narx yo'q");
      const base = j.cod_before_price ?? j.cod_amount;
      const prepaid = Math.max((j.quoted_amount ?? 0) - Number(base || 0), 0);
      const cod = accept
        ? Math.max(Number(j.final_amount) - prepaid, 0)
        : Math.max(Number(j.visit_fee_uzs ?? 0) - prepaid, 0);
      await j.update({ final_amount_status: accept ? 'accepted' : 'rejected', cod_amount: cod } as any, { transaction: t });
      await this.event(
        j.id, j.status, j.status, actor, {},
        [accept ? `Narx tasdiqlandi: ${j.final_amount}` : `Narx rad etildi — chiqish haqi ${j.visit_fee_uzs ?? 0}`, comment]
          .filter(Boolean)
          .join('. '),
        t,
        accept ? 'price_accepted' : 'price_rejected',
      );
      await recordOrderEvent({
        order_id: j.order_id,
        store_id: j.store_id,
        event: 'job_price_changed',
        actor_type: actor.type,
        actor_id: actor.id,
        note: `Ish #${j.id}: narx ${accept ? 'tasdiqlandi' : 'rad etildi'}${comment ? ` — ${comment}` : ''}`,
        transaction: t,
      });
      return j;
    });
    await pushWorker(
      j.worker_id,
      j.order_id,
      j.id,
      accept ? 'price_accepted' : 'price_rejected',
      accept ? 'Mijoz narxni tasdiqladi' : 'Mijoz narxni rad etdi',
      accept
        ? `#${j.id}: ${j.final_amount} so'm — ishni davom ettiring`
        : `#${j.id}: faqat chiqish haqi ${j.visit_fee_uzs ?? 0} so'm — fail (client_refused)`,
    );
    return customerView ? customerJobView(j) : backofficeJobView(j);
  }

  /** Mijoz ishni bekor qiladi — faqat usta yo'lga chiqquncha. */
  async customerCancel(orderId: number, jobId: number, comment: string | undefined, user: { id?: number; is_admin?: boolean }) {
    const j = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.customerJob(orderId, jobId, user, t);
      if (!JOB_CUSTOMER_CANCEL_FROM.includes(j.status as JobStatus)) {
        throw new ConflictException("Usta yo'lga chiqqan — endi faqat hamkor orqali bekor qilinadi");
      }
      await this.apply(j, 'cancel', { type: 'customer', id: user?.id ?? null }, {}, {}, comment || 'Mijoz bekor qildi', t);
      return j;
    });
    await pushWorker(j.worker_id, j.order_id, j.id, 'job_cancelled', 'Ish bekor qilindi', `#${j.id}: mijoz bekor qildi`);
    await pushStoreJobProblem(j.order_id, j.id, j.store_id, `Mijoz ishni bekor qildi${comment ? `: ${comment}` : ''}`);
    await syncOrderStatus(ServiceJob.sequelize, j.order_id, { actor_type: 'customer', actor_id: user?.id ?? null });
    return customerJobView(j);
  }

  /** Baho (10-band): faqat `completed` ish egasi, bitta ishga bitta baho. */
  async review(orderId: number, jobId: number, dto: ReviewDto, user: { id?: number; is_admin?: boolean }) {
    const j = await this.customerJob(orderId, jobId, user);
    if (j.status !== 'completed') throw new ConflictException('Baho faqat bajarilgan ishga qoldiriladi');
    const owner = await orderOwnerId(orderId);
    const exists = await ServiceReview.findOne({ where: { job_id: j.id } });
    if (exists) throw new ConflictException('Bu ishga baho allaqachon qoldirilgan');
    const row = await ServiceReview.create({
      job_id: j.id,
      order_id: j.order_id,
      store_id: j.store_id,
      user_id: owner,
      rating: dto.rating,
      comment: dto.comment?.trim() || null,
    } as any);
    await refreshStoreRating(j.store_id);
    return row;
  }

  /**
   * Kafolat bo'yicha murojaat (10-band): muddat ichida shu hamkorga YANGI ish,
   * narxi 0, `parent_job_id` bilan. Ochiq kafolat ishi bo'lsa — 409.
   */
  async warrantyClaim(orderId: number, jobId: number, dto: WarrantyClaimDto, user: { id?: number; is_admin?: boolean }) {
    const photos = assertOwnPhotoUrls(dto.photos, CUSTOMER_PHOTOS_MAX);
    const child = await ServiceJob.sequelize.transaction(async (t) => {
      const j = await this.customerJob(orderId, jobId, user, t);
      if (j.status !== 'completed') throw new ConflictException('Kafolat faqat bajarilgan ishga');
      if (!j.warranty_until || new Date(j.warranty_until).getTime() < Date.now()) {
        throw new ConflictException("Kafolat muddati tugagan yoki kafolat yo'q");
      }
      const open = await ServiceJob.count({
        where: { parent_job_id: j.id, status: { [Op.notIn]: ['completed', 'cancelled'] } },
        transaction: t,
      });
      if (open) throw new ConflictException('Bu ish bo\'yicha kafolat murojaati allaqachon ochiq');
      const c = await ServiceJob.create(
        {
          order_id: j.order_id,
          store_id: j.store_id,
          parent_job_id: j.id,
          status: 'pending',
          items: j.items,
          address: j.address,
          lat: j.lat,
          lng: j.lng,
          address_details: j.address_details,
          recipient_name: j.recipient_name,
          recipient_phone: j.recipient_phone,
          comment: dto.comment.trim(),
          customer_photos: photos,
          schedule_status: 'proposed',
          quoted_amount: 0,
          cod_amount: 0,
          visit_fee_uzs: null,
        } as any,
        { transaction: t },
      );
      await this.event(c.id, null, 'pending', { type: 'customer', id: user?.id ?? null }, {}, `Kafolat: ish #${j.id}`, t);
      await recordOrderEvent({
        order_id: j.order_id,
        store_id: j.store_id,
        event: 'warranty_claim',
        actor_type: 'customer',
        actor_id: user?.id ?? null,
        note: `Ish #${j.id} bo'yicha kafolat — yangi ish #${c.id}: ${dto.comment.trim()}`.slice(0, 1000),
        transaction: t,
      });
      return c;
    });
    await pushStoreWarrantyClaim(child.order_id, child.id, child.store_id);
    return customerJobView(child);
  }

  // ============================================================ ICHKI
  private async apply(j: ServiceJob, action: string, actor: JobActor, extra: any, geo: GeoDto, comment: string | null, t: Transaction) {
    const rule = JOB_TRANSITIONS[action];
    if (!rule.from.includes(j.status as JobStatus)) {
      throw new ConflictException(`${j.status} dan ${rule.to} ga o'tib bo'lmaydi`);
    }
    const from = j.status;
    const payload: any = { ...extra, status: rule.to };
    const stamp = JOB_STATUS_TIME[rule.to];
    if (stamp) payload[stamp] = new Date();
    if (action === 'reject' || action === 'retry') {
      payload.assigned_at = null;
      payload.accepted_at = null;
    }
    await j.update(payload, { transaction: t });
    await this.event(j.id, from, rule.to, actor, geo, comment, t);
    const orderEvent = ORDER_EVENT_OF[action];
    if (orderEvent) {
      await recordOrderEvent({
        order_id: j.order_id,
        store_id: j.store_id,
        event: orderEvent,
        actor_type: actor.type,
        actor_id: actor.id,
        note: `Ish #${j.id}${comment ? `: ${comment}` : ''}`,
        transaction: t,
      });
    }
  }

  private event(
    jobId: number,
    from: string | null,
    to: string,
    actor: JobActor,
    geo: GeoDto,
    comment: string | null,
    t?: Transaction,
    event: string | null = null,
  ) {
    return ServiceJobEvent.create(
      {
        job_id: jobId,
        from_status: from,
        to_status: to,
        event,
        actor_type: actor.type,
        actor_id: actor.id,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        comment: comment ? String(comment).slice(0, 1000) : null,
        created_at: new Date(),
      } as any,
      { transaction: t },
    );
  }

  /** Har amaldagi joylashuv — `couriers.last_*` (kuzatish shundan o'qiydi). */
  private async touch(w: Courier, geo: GeoDto) {
    if (geo?.lat == null || geo?.lng == null) return;
    await Courier.update({ last_lat: geo.lat, last_lng: geo.lng, last_seen_at: new Date() } as any, { where: { id: w.id } });
  }
}

/**
 * Buyurtma bekor qilinganda ochiq ishlar ham bekor + ustaga push
 * (`cancelDeliveriesForOrder` ning egizagi). Statik — DI sikli bo'lmasin.
 */
export async function cancelJobsForOrder(orderId: number, actor: JobActor) {
  const logger = new Logger('ServiceJobs');
  try {
    const live = await ServiceJob.findAll({
      where: { order_id: orderId, status: { [Op.in]: JOB_TRANSITIONS.cancel.from } },
    });
    for (const j of live) {
      const from = j.status;
      await j.update({ status: 'cancelled', cancelled_at: new Date() } as any);
      await ServiceJobEvent.create({
        job_id: j.id,
        from_status: from,
        to_status: 'cancelled',
        actor_type: actor.type,
        actor_id: actor.id,
        comment: 'Buyurtma bekor qilindi',
        created_at: new Date(),
      } as any);
      await pushWorker(j.worker_id, j.order_id, j.id, 'job_cancelled', 'Ish bekor qilindi', `#${j.id}: buyurtma bekor qilindi`);
    }
    return live.length;
  } catch (e) {
    logger.error(`Ishlarni bekor qilib bo'lmadi (buyurtma #${orderId}): ${(e as Error).message}`);
    return 0;
  }
}

/** Hamkorning xizmat reytingi — yashirilmagan sharhlardan (10-band). */
export async function refreshStoreRating(storeId: number) {
  await ServiceJob.sequelize.query(
    `UPDATE stores s SET
        service_rating = r.avg, service_reviews_count = r.n
       FROM (SELECT ROUND(AVG(rating)::numeric, 2) AS avg, COUNT(*)::int AS n
               FROM service_reviews WHERE store_id = :id AND NOT is_hidden) r
      WHERE s.id = :id`,
    { replacements: { id: storeId } },
  );
}

function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

const fmt = (d: Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat('uz-UZ', {
        timeZone: 'Asia/Tashkent',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(d))
    : '';
