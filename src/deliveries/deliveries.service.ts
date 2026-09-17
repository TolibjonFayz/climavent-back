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
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { Op, QueryTypes, Transaction, UniqueConstraintError } from 'sequelize';
import type { StoreRequester } from 'src/store_auth/store_auth.guard';
import { OtpService } from 'src/otp/otp.service';
import {
  ACTIVE_STATUSES,
  ActorType,
  DeliveryStatus,
  HISTORY_MASK_AFTER_MS,
  HISTORY_STATUSES,
  PROOF_CODE_MAX_ATTEMPTS,
  TRANSITIONS,
  vehicleFits,
} from './constants';
import { Courier, CourierLocation, Delivery, DeliveryEvent, DeliveryProof } from './model/models';
import {
  CourierDeliverDto,
  CourierFailDto,
  CreateDeliveryDto,
  LocationDto,
  UpdateDeliveryDto,
} from './dto/dto';
import { ProofStorageService } from './proof-storage.service';
import { pushToCourier, pushToStoreAdmins } from './push';

export interface Actor {
  type: ActorType;
  id: number | null;
}
interface Geo {
  lat?: number | null;
  lng?: number | null;
}

const STATUS_TIME: Partial<Record<DeliveryStatus, keyof Delivery>> = {
  assigned: 'assigned_at',
  accepted: 'accepted_at',
  picked_up: 'picked_up_at',
  on_the_way: 'on_the_way_at',
  delivered: 'delivered_at',
  failed: 'failed_at',
  returned: 'returned_at',
  cancelled: 'cancelled_at',
};

/** Adminka so'rovchisidan tarix uchun "kim" */
export const backofficeActor = (r: StoreRequester): Actor => ({
  type: r?.role === 'superadmin' ? 'superadmin' : 'store',
  id: r?.user_id ?? null,
});

const codeHash = (deliveryId: number, code: string) =>
  createHmac('sha256', `delivery-code:${process.env.OTP_HASH_SECRET || process.env.ACCESS_TOKEN_KEY || ''}`)
    .update(`${deliveryId}:${code}`)
    .digest('hex');

/** +998 90 *** ** 96 */
export const maskPhone = (phone?: string | null) => {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 12) return phone ? '***' : null;
  return `+${d.slice(0, 3)} ${d.slice(3, 5)} *** ** ${d.slice(-2)}`;
};

/** Manzildan faqat tuman/ko'cha: uy, xonadon raqamlari va tafsilot olib tashlanadi. */
export const maskAddress = (address?: string | null) => {
  if (!address) return null;
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/\d/.test(p) || /(tuman|district|район|mfy|ko'cha|ko‘cha|kucha|street|улица)/i.test(p))
    .map((p) => p.replace(/\s*\d+[\w/-]*\s*(uy|xonadon|kv|dom|д\.?)?\s*$/i, '').trim())
    .filter(Boolean);
  return parts.slice(0, 3).join(', ') || null;
};

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  constructor(
    private readonly proofs: ProofStorageService,
    private readonly sms: OtpService,
  ) {}

  // ============================================================ ADMINKA
  private isSuper = (r: StoreRequester) => r?.role === 'superadmin';

  /** Do'kon admini begona do'kon yetkazishini ko'rmaydi — 404 (borligini ham bildirmaymiz). */
  private async loadScoped(id: number, r: StoreRequester, t?: Transaction, lock = false) {
    const d = await Delivery.findByPk(id, { transaction: t, ...(lock && t ? { lock: t.LOCK.UPDATE } : {}) });
    if (!d || (!this.isSuper(r) && Number(d.store_id) !== Number(r.store_id))) {
      throw new NotFoundException('Yetkazish topilmadi');
    }
    return d;
  }

  async create(dto: CreateDeliveryDto, r: StoreRequester) {
    if (!this.isSuper(r) && Number(dto.store_id) !== Number(r.store_id)) {
      throw new ForbiddenException("Faqat o'z do'koningiz uchun yetkazish yarata olasiz");
    }
    const [order]: any[] = await Delivery.sequelize.query(
      `SELECT o.id, o.status, o.location, o.address_details, o.lat, o.lng, o.recipient_name, o.recipient_phone,
              u.name AS user_name, u.surname AS user_surname, u.phone_number AS user_phone
         FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = :id`,
      { replacements: { id: dto.order_id }, type: QueryTypes.SELECT },
    );
    if (!order) throw new NotFoundException('Buyurtma topilmadi');
    if (order.status === 'cancelled') throw new ConflictException('Bekor qilingan buyurtmaga yetkazish yaratib bo\'lmaydi');

    const [store]: any[] = await Delivery.sequelize.query('SELECT id, address FROM stores WHERE id = :id', {
      replacements: { id: dto.store_id },
      type: QueryTypes.SELECT,
    });
    if (!store) throw new BadRequestException("Bunday do'kon yo'q (store_id)");

    // Buyurtmaning SHU do'kondagi qatorlari
    const storeItems: any[] = await Delivery.sequelize.query(
      `SELECT i.id FROM "order-items" i JOIN products p ON p.id = i.product_id
        WHERE i.order_id = :order AND p.store_id = :store ORDER BY i.id`,
      { replacements: { order: dto.order_id, store: dto.store_id }, type: QueryTypes.SELECT },
    );
    const own = new Set(storeItems.map((x) => Number(x.id)));
    if (!own.size) throw new BadRequestException("Buyurtmada bu do'kon mahsuloti yo'q");
    const items = dto.items?.length ? [...new Set(dto.items.map(Number))] : [...own];
    if (items.some((x) => !own.has(x))) {
      throw new BadRequestException("items: faqat buyurtmaning shu do'kondagi qatorlari");
    }
    this.validateWindow(dto.window_from, dto.window_to);

    const recipientPhone = dto.recipient_phone ?? order.recipient_phone ?? (/^\+998\d{9}$/.test(order.user_phone || '') ? order.user_phone : null);
    try {
      return await Delivery.sequelize.transaction(async (t) => {
        const d = await Delivery.create(
          {
            order_id: dto.order_id,
            store_id: dto.store_id,
            status: 'pending',
            provider: 'own',
            required_vehicle: dto.required_vehicle || 'car',
            // Manzil berilmasa — do'kondan (olish) va buyurtmadan (topshirish)
            pickup_address: dto.pickup_address ?? store.address ?? null,
            pickup_lat: dto.pickup_lat ?? null,
            pickup_lng: dto.pickup_lng ?? null,
            dropoff_address: dto.dropoff_address ?? order.location ?? null,
            dropoff_lat: dto.dropoff_lat ?? order.lat ?? null,
            dropoff_lng: dto.dropoff_lng ?? order.lng ?? null,
            dropoff_details: dto.dropoff_details ?? order.address_details ?? null,
            recipient_name: dto.recipient_name ?? order.recipient_name ?? ([order.user_name, order.user_surname].filter(Boolean).join(' ') || null),
            recipient_phone: recipientPhone,
            window_from: dto.window_from ?? null,
            window_to: dto.window_to ?? null,
            items,
            cod_amount: dto.cod_amount ?? 0,
            delivery_fee: dto.delivery_fee ?? null,
          } as any,
          { transaction: t },
        );
        await this.event(d.id, null, 'pending', backofficeActor(r), {}, 'Yaratildi', t);
        return d;
      });
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        throw new ConflictException("Bu buyurtma va do'kon uchun faol yetkazish allaqachon bor");
      }
      throw e;
    }
  }

  async list(
    r: StoreRequester,
    q: { status?: string; store_id?: string; courier_id?: string; order_id?: string; date_from?: string; date_to?: string; page?: string; limit?: string },
  ) {
    const where: any = {};
    if (!this.isSuper(r)) where.store_id = r.store_id;
    else if (q.store_id) where.store_id = Number(q.store_id);
    if (q.status) where.status = { [Op.in]: q.status.split(',').map((s) => s.trim()) };
    if (q.courier_id) where.courier_id = q.courier_id === 'null' ? null : Number(q.courier_id);
    if (q.order_id) where.order_id = Number(q.order_id);
    const range: any = {};
    if (q.date_from && !isNaN(Date.parse(q.date_from))) range[Op.gte] = new Date(q.date_from);
    if (q.date_to && !isNaN(Date.parse(q.date_to))) range[Op.lte] = new Date(q.date_to);
    if (Object.getOwnPropertySymbols(range).length) where.created_at = range;
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const page = Math.max(Number(q.page) || 1, 1);
    const { rows, count } = await Delivery.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      attributes: { exclude: ['proof_code_hash'] },
    });
    return { rows, total: count, page, limit };
  }

  async getOne(id: number, r: StoreRequester) {
    const d = await this.loadScoped(id, r);
    return this.present(d, { full: true });
  }

  async update(id: number, dto: UpdateDeliveryDto, r: StoreRequester) {
    const result = await Delivery.sequelize.transaction(async (t) => {
      const d = await this.loadScoped(id, r, t, true);
      if (!['pending', 'assigned'].includes(d.status)) {
        throw new ConflictException(`${d.status} holatida manzil, vaqt va summani o'zgartirib bo'lmaydi`);
      }
      const payload: any = {};
      for (const [k, v] of Object.entries(dto)) if (v !== undefined) payload[k] = v;
      if (!Object.keys(payload).length) return { d, addressChanged: false };
      this.validateWindow(payload.window_from ?? d.window_from, payload.window_to ?? d.window_to);

      if (payload.required_vehicle && d.courier_id) {
        const c = await Courier.findByPk(d.courier_id, { transaction: t });
        if (c && !vehicleFits(c.vehicle_type, payload.required_vehicle)) {
          throw new ConflictException(`Biriktirilgan kuryer transporti (${c.vehicle_type}) ${payload.required_vehicle} talabiga mos emas`);
        }
      }
      const addressChanged = ['dropoff_address', 'dropoff_lat', 'dropoff_lng', 'dropoff_details', 'pickup_address', 'window_from', 'window_to']
        .some((k) => payload[k] !== undefined);
      await d.update(payload, { transaction: t });
      await this.event(d.id, d.status, d.status, backofficeActor(r), {}, `O'zgartirildi: ${Object.keys(payload).join(', ')}`, t);
      return { d, addressChanged };
    });
    if (result.addressChanged && result.d.courier_id) {
      await pushToCourier(result.d.courier_id, {
        title: "Yetkazish o'zgardi",
        body: `#${result.d.id}: manzil yoki vaqt yangilandi`,
        data: { type: 'delivery_updated', delivery_id: result.d.id },
      });
    }
    return this.present(result.d, { full: false });
  }

  async assign(id: number, courierId: number, r: StoreRequester) {
    const d = await Delivery.sequelize.transaction(async (t) => {
      const d = await this.loadScoped(id, r, t, true);
      const courier = await Courier.findByPk(courierId, { transaction: t });
      if (!courier) throw new NotFoundException('Kuryer topilmadi');
      // Platforma kuryerini faqat superadmin; do'kon admini faqat o'z kuryerini
      if (!this.isSuper(r)) {
        if (courier.store_id === null) throw new ForbiddenException('Platforma kuryerini faqat superadmin biriktiradi');
        if (Number(courier.store_id) !== Number(r.store_id)) throw new ForbiddenException("Bu kuryer boshqa do'konga tegishli");
      }
      // Do'kon kuryeri boshqa do'kon tovarini olib ketmaydi
      if (courier.store_id !== null && Number(courier.store_id) !== Number(d.store_id)) {
        throw new ForbiddenException("Do'kon kuryeri faqat o'z do'koni yetkazishiga biriktiriladi");
      }
      if (!courier.is_active) throw new ConflictException('Kuryer faol emas');
      if (!vehicleFits(courier.vehicle_type, d.required_vehicle)) {
        throw new ConflictException(`Kuryer transporti (${courier.vehicle_type}) ${d.required_vehicle} talabiga mos emas`);
      }
      const previous = d.courier_id;
      await this.apply(d, 'assign', backofficeActor(r), { courier_id: courier.id }, {}, `Kuryer: ${courier.full_name}`, t);
      return Object.assign(d, { _previous: previous });
    });
    const previous = (d as any)._previous;
    if (previous && previous !== d.courier_id) {
      await pushToCourier(previous, { title: 'Yetkazish olib qo\'yildi', body: `#${d.id} boshqa kuryerga berildi`, data: { type: 'delivery_unassigned', delivery_id: d.id } });
    }
    await pushToCourier(d.courier_id, {
      title: 'Yangi yetkazish',
      body: `#${d.id}: ${d.pickup_address || ''} → ${d.dropoff_address || ''}`.slice(0, 180),
      data: { type: 'delivery_assigned', delivery_id: d.id },
    });
    return this.present(d, { full: false });
  }

  async cancel(id: number, comment: string | undefined, r: StoreRequester) {
    const d = await Delivery.sequelize.transaction(async (t) => {
      const d = await this.loadScoped(id, r, t, true);
      await this.apply(d, 'cancel', backofficeActor(r), {}, {}, comment || null, t);
      return d;
    });
    await pushToCourier(d.courier_id, { title: 'Yetkazish bekor qilindi', body: `#${d.id}`, data: { type: 'delivery_cancelled', delivery_id: d.id } });
    return this.present(d, { full: false });
  }

  async returned(id: number, r: StoreRequester) {
    const d = await Delivery.sequelize.transaction(async (t) => {
      const d = await this.loadScoped(id, r, t, true);
      await this.apply(d, 'return', backofficeActor(r), {}, {}, "Tovar omborga qaytdi", t);
      return d;
    });
    return this.present(d, { full: false });
  }

  async retry(id: number, r: StoreRequester) {
    const d = await Delivery.sequelize.transaction(async (t) => {
      const d = await this.loadScoped(id, r, t, true);
      await this.apply(
        d,
        'retry',
        backofficeActor(r),
        // Qayta yetkazish — yangi kuryer, yangi kod
        { courier_id: null, proof_code_hash: null, proof_code_attempts: 0, failure_reason: null, failure_comment: null },
        {},
        'Qayta yetkazish',
        t,
      );
      return d;
    });
    return this.present(d, { full: false });
  }

  async proofFile(id: number, proofId: number, r: StoreRequester) {
    await this.loadScoped(id, r);
    const proof = await DeliveryProof.findOne({ where: { id: proofId, delivery_id: id } });
    if (!proof) throw new NotFoundException('Rasm topilmadi');
    const data = await this.proofs.open(proof);
    if (!data) throw new NotFoundException("Rasm o'chirilgan");
    return { proof, data };
  }

  /** Buyurtmaning yetkazishlari (GET /orders/:id uchun). */
  async forOrder(orderId: number, r: StoreRequester) {
    const where: any = { order_id: orderId };
    if (!this.isSuper(r)) where.store_id = r.store_id;
    const rows = await Delivery.findAll({ where, order: [['id', 'ASC']] });
    return Promise.all(rows.map((d) => this.present(d, { full: false })));
  }

  // ============================================================ HISOBOT (10-band)
  async stats(r: StoreRequester, q: { date_from?: string; date_to?: string; store_id?: string; courier_id?: string }) {
    const cond: string[] = ['1=1'];
    const rep: any = {};
    if (!this.isSuper(r)) {
      cond.push('d.store_id = :store');
      rep.store = r.store_id;
    } else if (q.store_id) {
      cond.push('d.store_id = :store');
      rep.store = Number(q.store_id);
    }
    if (q.courier_id) {
      cond.push('d.courier_id = :courier');
      rep.courier = Number(q.courier_id);
    }
    if (q.date_from && !isNaN(Date.parse(q.date_from))) {
      cond.push('d.created_at >= :from');
      rep.from = new Date(q.date_from);
    }
    if (q.date_to && !isNaN(Date.parse(q.date_to))) {
      cond.push('d.created_at <= :to');
      rep.to = new Date(q.date_to);
    }
    const W = cond.join(' AND ');
    const sel = (sql: string) => Delivery.sequelize.query(sql, { replacements: rep, type: QueryTypes.SELECT }) as Promise<any[]>;

    const [totals] = await sel(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
             COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
             COUNT(*) FILTER (WHERE status = 'returned')::int AS returned,
             COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
             COUNT(*) FILTER (WHERE status IN ('pending','assigned','accepted','picked_up','on_the_way'))::int AS in_progress,
             ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - assigned_at)) / 60) FILTER (WHERE status = 'delivered' AND assigned_at IS NOT NULL))::int AS avg_assigned_to_delivered_min,
             COUNT(*) FILTER (WHERE status = 'delivered' AND window_to IS NOT NULL)::int AS with_window,
             COUNT(*) FILTER (WHERE status = 'delivered' AND window_to IS NOT NULL AND delivered_at <= window_to)::int AS on_time
        FROM deliveries d WHERE ${W}`);
    const failures = await sel(`
      SELECT failure_reason AS reason, COUNT(*)::int AS count FROM deliveries d
       WHERE ${W} AND failure_reason IS NOT NULL GROUP BY failure_reason ORDER BY count DESC`);
    const couriers = await sel(`
      SELECT c.id AS courier_id, c.full_name,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE d.status = 'delivered')::int AS delivered,
             COUNT(*) FILTER (WHERE d.status = 'failed')::int AS failed,
             ROUND(AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.assigned_at)) / 60) FILTER (WHERE d.status = 'delivered'))::int AS avg_minutes,
             COALESCE(SUM(d.cash_collected) FILTER (WHERE d.status = 'delivered'), 0)::bigint AS cash_collected
        FROM deliveries d JOIN couriers c ON c.id = d.courier_id
       WHERE ${W} GROUP BY c.id, c.full_name ORDER BY delivered DESC, total DESC`);
    return {
      ...totals,
      on_time_share: totals.with_window ? Math.round((totals.on_time / totals.with_window) * 1000) / 1000 : null,
      failures,
      couriers: couriers.map((c) => ({ ...c, cash_collected: Number(c.cash_collected) })),
    };
  }

  // ============================================================ KURYER
  async courierList(courier: Courier, scope: string) {
    const statuses = scope === 'history' ? HISTORY_STATUSES : ACTIVE_STATUSES;
    const rows = await Delivery.findAll({
      where: { courier_id: courier.id, status: { [Op.in]: statuses } },
      order: scope === 'history' ? [['updated_at', 'DESC']] : [['window_from', 'ASC NULLS LAST'], ['id', 'ASC']],
      limit: scope === 'history' ? 100 : 200,
    });
    return Promise.all(rows.map((d) => this.present(d, { forCourier: true })));
  }

  /** Kuryer faqat O'ZIGA biriktirilganini ko'radi; boshqasi — 404. */
  async courierGet(courier: Courier, id: number, t?: Transaction, lock = false) {
    const d = await Delivery.findByPk(id, { transaction: t, ...(lock && t ? { lock: t.LOCK.UPDATE } : {}) });
    if (!d || Number(d.courier_id) !== Number(courier.id)) throw new NotFoundException('Yetkazish topilmadi');
    return d;
  }

  async courierOne(courier: Courier, id: number) {
    return this.present(await this.courierGet(courier, id), { forCourier: true, full: true });
  }

  async courierAction(courier: Courier, id: number, action: 'accept' | 'pickup' | 'start' | 'reject', body: { comment?: string } & Geo) {
    const actor: Actor = { type: 'courier', id: courier.store_user_id };
    let code: string | null = null;
    const d = await Delivery.sequelize.transaction(async (t) => {
      const d = await this.courierGet(courier, id, t, true);
      const extra: any = {};
      if (action === 'reject') extra.courier_id = null;
      if (action === 'start') {
        code = String(randomInt(0, 10000)).padStart(4, '0');
        extra.proof_code_hash = codeHash(d.id, code);
        extra.proof_code_attempts = 0;
      }
      await this.apply(d, action, actor, extra, body, body.comment || null, t);
      return d;
    });
    await this.touchCourier(courier, body);

    if (action === 'start') {
      await this.onTheWay(d, courier, code);
    } else if (action === 'reject') {
      await pushToStoreAdmins([d.store_id], {
        title: 'Kuryer rad etdi',
        body: `#${d.id}: ${courier.full_name} — ${body.comment}`.slice(0, 180),
        data: { type: 'delivery_rejected', delivery_id: d.id },
      });
    }
    return this.present(d, { forCourier: true });
  }

  async courierDeliver(courier: Courier, id: number, dto: CourierDeliverDto, photo?: Express.Multer.File) {
    const actor: Actor = { type: 'courier', id: courier.store_user_id };
    // Oldindan (qulfsiz) tekshiruvlar — rasm saqlashdan oldin
    const pre = await this.courierGet(courier, id);
    const t0 = TRANSITIONS.deliver;
    if (!t0.from.includes(pre.status as DeliveryStatus)) {
      throw new ConflictException(`${pre.status} dan delivered ga o'tib bo'lmaydi`);
    }
    const hasPhoto = !!photo?.buffer?.length;
    if (!dto.code && !hasPhoto) {
      throw new BadRequestException("Topshirish kodi yoki rasm (izoh bilan) majburiy");
    }
    if (!dto.code && hasPhoto && !dto.comment?.trim()) {
      throw new BadRequestException('Kodsiz topshirishda rasm bilan birga izoh majburiy');
    }
    if (pre.cod_amount > 0) {
      if (dto.cash_collected === undefined || dto.cash_collected === null) {
        throw new BadRequestException(`cash_collected majburiy: mijozdan ${pre.cod_amount} so'm olinishi kerak`);
      }
      if (Number(dto.cash_collected) !== Number(pre.cod_amount) && !dto.comment?.trim()) {
        throw new BadRequestException(`Olingan summa ${pre.cod_amount} dan farq qiladi — izoh majburiy`);
      }
    }

    // Kod — qulf ostida: parallel urinishlar hisoblagichni aylanib o'tmasin
    if (dto.code) {
      const res = await Delivery.sequelize.transaction(async (t) => {
        const d = await this.courierGet(courier, id, t, true);
        if (d.proof_code_attempts >= PROOF_CODE_MAX_ATTEMPTS) return 'blocked';
        const ok =
          !!d.proof_code_hash &&
          timingSafeEqual(Buffer.from(codeHash(d.id, dto.code)), Buffer.from(d.proof_code_hash));
        if (!ok) {
          await d.update({ proof_code_attempts: d.proof_code_attempts + 1 }, { transaction: t });
          return `wrong:${PROOF_CODE_MAX_ATTEMPTS - d.proof_code_attempts}`;
        }
        return 'ok';
      });
      if (res === 'wrong:0') {
        throw new BadRequestException("Topshirish kodi xato — kod bloklandi, endi rasm va izoh bilan topshiring");
      }
      if (res === 'blocked') {
        throw new HttpException(
          "Kod 5 marta noto'g'ri kiritildi va bloklandi — rasm va izoh bilan topshiring",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (res !== 'ok') throw new BadRequestException(`Topshirish kodi xato (qolgan urinish: ${res.split(':')[1]})`);
    }

    const proof = hasPhoto ? await this.proofs.save(id, 'delivered', photo) : null;
    const d = await Delivery.sequelize.transaction(async (t) => {
      const d = await this.courierGet(courier, id, t, true);
      await this.apply(
        d,
        'deliver',
        actor,
        {
          cash_collected: d.cod_amount > 0 ? Number(dto.cash_collected) : dto.cash_collected ?? null,
          proof_comment: dto.comment?.trim() || null,
          ...(proof ? { proof_photo_url: `/api/deliveries/${d.id}/proofs/${proof.id}` } : {}),
        },
        dto,
        [dto.code ? 'Kod bilan' : 'Rasm bilan', dto.comment?.trim()].filter(Boolean).join(': '),
        t,
      );
      return d;
    });
    await this.touchCourier(courier, dto);
    await this.syncOrderAfterDelivered(d.order_id);
    if (d.recipient_phone) {
      await this.sendSms(d.recipient_phone, `Buyurtmangiz #${d.order_id} topshirildi. Xaridingiz uchun rahmat! Climavent.uz`);
    }
    return this.present(d, { forCourier: true });
  }

  async courierFail(courier: Courier, id: number, dto: CourierFailDto, photo?: Express.Multer.File) {
    const pre = await this.courierGet(courier, id);
    if (!TRANSITIONS.fail.from.includes(pre.status as DeliveryStatus)) {
      throw new ConflictException(`${pre.status} dan failed ga o'tib bo'lmaydi`);
    }
    const proof = photo?.buffer?.length ? await this.proofs.save(id, 'failed', photo) : null;
    const d = await Delivery.sequelize.transaction(async (t) => {
      const d = await this.courierGet(courier, id, t, true);
      await this.apply(
        d,
        'fail',
        { type: 'courier', id: courier.store_user_id },
        {
          failure_reason: dto.failure_reason,
          failure_comment: dto.failure_comment?.trim() || null,
          ...(proof ? { proof_photo_url: `/api/deliveries/${d.id}/proofs/${proof.id}` } : {}),
        },
        dto,
        [dto.failure_reason, dto.failure_comment?.trim()].filter(Boolean).join(': '),
        t,
      );
      return d;
    });
    await this.touchCourier(courier, dto);
    await pushToStoreAdmins([d.store_id], {
      title: 'Yetkazish amalga oshmadi',
      body: `#${d.id}: ${dto.failure_reason}${dto.failure_comment ? ` — ${dto.failure_comment}` : ''}`.slice(0, 180),
      data: { type: 'delivery_failed', delivery_id: d.id },
    });
    return this.present(d, { forCourier: true });
  }

  /**
   * Joylashuv (6-band). `couriers.last_*` doim yangilanadi; yo'l tarixi FAQAT faol
   * yetkazish (qabul qilingan, olingan yoki yo'lda) bor paytda yoziladi.
   */
  async location(courier: Courier, dto: LocationDto) {
    await this.touchCourier(courier, dto);
    const active = await Delivery.findOne({
      where: { courier_id: courier.id, status: { [Op.in]: ['accepted', 'picked_up', 'on_the_way'] } },
      order: [[Delivery.sequelize.literal("CASE status WHEN 'on_the_way' THEN 0 WHEN 'picked_up' THEN 1 ELSE 2 END"), 'ASC']],
    });
    if (active) {
      await CourierLocation.create({ courier_id: courier.id, delivery_id: active.id, lat: dto.lat, lng: dto.lng, accuracy: dto.accuracy ?? null } as any);
    }
    return { stored: !!active, last_seen_at: new Date() };
  }

  // ============================================================ ICHKI
  /**
   * O'tishni qo'llaydi (tranzaksiya ichida, qator qulflangan bo'lishi kerak).
   * Ruxsat etilmagan o'tish — 409 va aniq xabar.
   */
  private async apply(d: Delivery, action: string, actor: Actor, extra: any, geo: Geo, comment: string | null, t: Transaction) {
    const rule = TRANSITIONS[action];
    if (!rule.from.includes(d.status as DeliveryStatus)) {
      throw new ConflictException(`${d.status} dan ${rule.to} ga o'tib bo'lmaydi`);
    }
    const from = d.status;
    const payload: any = { ...extra, status: rule.to };
    const stamp = STATUS_TIME[rule.to];
    if (stamp) payload[stamp] = new Date();
    if (action === 'retry' || action === 'reject') {
      payload.assigned_at = null;
      payload.accepted_at = null;
    }
    await d.update(payload, { transaction: t });
    await this.event(d.id, from, rule.to, actor, geo, comment, t);
  }

  private event(deliveryId: number, from: string | null, to: string, actor: Actor, geo: Geo, comment: string | null, t?: Transaction) {
    return DeliveryEvent.create(
      {
        delivery_id: deliveryId,
        from_status: from,
        to_status: to,
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

  private async touchCourier(courier: Courier, geo: Geo) {
    if (geo?.lat == null || geo?.lng == null) return;
    await Courier.update(
      { last_lat: geo.lat, last_lng: geo.lng, last_seen_at: new Date() } as any,
      { where: { id: courier.id } },
    );
  }

  /** Yo'lga chiqdi: mijozga kod bilan SMS, buyurtma — shipping (3-band). */
  private async onTheWay(d: Delivery, courier: Courier, code: string | null) {
    try {
      await Delivery.sequelize.query(
        `UPDATE orders SET status = 'shipping', "updatedAt" = now() WHERE id = :id AND status IN ('new', 'paid', 'quote_sent')`,
        { replacements: { id: d.order_id } },
      );
    } catch (e) {
      this.logger.error(`Buyurtma holati (shipping) yozilmadi: ${(e as Error).message}`);
    }
    if (d.recipient_phone && code) {
      await this.sendSms(
        d.recipient_phone,
        `Buyurtmangiz yo'lda. Kuryer: ${courier.full_name}, ${courier.phone}. Topshirish kodi: ${code}`,
      );
    }
  }

  /** Buyurtmaning (bekor qilinmagan) hamma yetkazishlari topshirilgan bo'lsa — done. */
  private async syncOrderAfterDelivered(orderId: number) {
    try {
      const [row]: any[] = await Delivery.sequelize.query(
        `SELECT COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'returned'))::int AS live,
                COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered
           FROM deliveries WHERE order_id = :id`,
        { replacements: { id: orderId }, type: QueryTypes.SELECT },
      );
      if (row.delivered > 0 && row.delivered === row.live) {
        await Delivery.sequelize.query(
          `UPDATE orders SET status = 'done', "updatedAt" = now() WHERE id = :id AND status <> 'cancelled'`,
          { replacements: { id: orderId } },
        );
      }
    } catch (e) {
      this.logger.error(`Buyurtma holati (done) yozilmadi: ${(e as Error).message}`);
    }
  }

  private async sendSms(phone: string, text: string) {
    try {
      const res: any = await this.sms.sendSms(phone, text);
      if (res !== true) this.logger.warn(`SMS yuborilmadi (${maskPhone(phone)}): ${res?.message || res?.status}`);
    } catch (e) {
      this.logger.warn(`SMS xatosi: ${(e as Error).message}`);
    }
  }

  private validateWindow(from?: any, to?: any) {
    if (from && to && new Date(to).getTime() <= new Date(from).getTime()) {
      throw new BadRequestException("window_to window_from dan keyin bo'lsin");
    }
  }

  /**
   * Javob shakli. Kuryerga:
   *   - hech qachon `proof_code_hash` va urinishlar soni emas;
   *   - tarixdagi (yakunlangan) yetkazishda 24 soatdan keyin telefon yashiriladi,
   *     manzil — faqat tuman/ko'cha, koordinata va tafsilot yo'q (4-band).
   */
  async present(d: Delivery, opts: { forCourier?: boolean; full?: boolean }) {
    const plain: any = { ...(d.get({ plain: true }) as any) };
    delete plain.proof_code_hash;
    delete plain._previous;

    if (opts.forCourier) {
      delete plain.proof_code_attempts;
      const finishedAt = plain.delivered_at || plain.failed_at || plain.returned_at || plain.cancelled_at;
      const masked =
        HISTORY_STATUSES.includes(plain.status) &&
        finishedAt &&
        Date.now() - new Date(finishedAt).getTime() > HISTORY_MASK_AFTER_MS;
      if (masked) {
        plain.recipient_phone = maskPhone(plain.recipient_phone);
        plain.dropoff_address = maskAddress(plain.dropoff_address);
        plain.dropoff_details = null;
        plain.dropoff_lat = null;
        plain.dropoff_lng = null;
        plain.recipient_name = plain.recipient_name ? String(plain.recipient_name).split(' ')[0] : null;
      }
      plain.masked = !!masked;
      if (opts.full && !masked) {
        plain.order_items = await this.itemsOf(plain.items);
      }
      return plain;
    }

    if (opts.full) {
      plain.events = await DeliveryEvent.findAll({ where: { delivery_id: d.id }, order: [['id', 'ASC']] });
      plain.proofs = await DeliveryProof.findAll({
        where: { delivery_id: d.id },
        attributes: ['id', 'kind', 'mime', 'size', 'created_at'],
        order: [['id', 'ASC']],
      });
      plain.order_items = await this.itemsOf(plain.items);
      if (d.courier_id) {
        const c = await Courier.findByPk(d.courier_id);
        plain.courier = c
          ? {
              id: c.id,
              full_name: c.full_name,
              phone: c.phone,
              vehicle_type: c.vehicle_type,
              is_online: c.is_online,
              last_lat: c.last_lat,
              last_lng: c.last_lng,
              last_seen_at: c.last_seen_at,
            }
          : null;
      }
    }
    return plain;
  }

  private async itemsOf(ids: number[]) {
    if (!ids?.length) return [];
    return Delivery.sequelize.query(
      `SELECT i.id, i.product_id, i.product_model, i.quantity, p.name_uz, p.name_ru, p.name_en
         FROM "order-items" i LEFT JOIN products p ON p.id = i.product_id WHERE i.id IN (:ids) ORDER BY i.id`,
      { replacements: { ids }, type: QueryTypes.SELECT },
    );
  }
}

/**
 * Buyurtma bekor qilinganda faol yetkazishlar ham bekor + kuryerga push (3-band).
 * Buyurtmalar moduli chaqiradi — DI siklini oldini olish uchun statik funksiya.
 */
export async function cancelDeliveriesForOrder(orderId: number, actor: Actor) {
  const logger = new Logger('Deliveries');
  try {
    const live = await Delivery.findAll({
      where: { order_id: orderId, status: { [Op.in]: TRANSITIONS.cancel.from } },
    });
    for (const d of live) {
      const from = d.status;
      await d.update({ status: 'cancelled', cancelled_at: new Date() });
      await DeliveryEvent.create({
        delivery_id: d.id,
        from_status: from,
        to_status: 'cancelled',
        actor_type: actor.type,
        actor_id: actor.id,
        comment: 'Buyurtma bekor qilindi',
        created_at: new Date(),
      } as any);
      await pushToCourier(d.courier_id, { title: 'Yetkazish bekor qilindi', body: `#${d.id}: buyurtma bekor qilindi`, data: { type: 'delivery_cancelled', delivery_id: d.id } });
    }
    return live.length;
  } catch (e) {
    logger.error(`Yetkazishlarni bekor qilib bo'lmadi (buyurtma #${orderId}): ${(e as Error).message}`);
    return 0;
  }
}
