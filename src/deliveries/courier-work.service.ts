import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Op, QueryTypes } from 'sequelize';
import type { StoreRequester } from 'src/store_auth/store_auth.guard';
import { ACTIVE_STATUSES } from './constants';
import {
  Courier,
  CourierPayout,
  CourierRate,
  CourierShift,
  CourierVehicle,
  Delivery,
} from './model/models';
import { CourierPayoutDto, CourierRateDto, ShiftEndDto, ShiftStartDto } from './dto/dto';
import { CourierVehiclesService } from './courier-vehicles.service';
import { CLASS_SPEC, VehicleClass, classOf, isVehicleClass } from './vehicle-classes';

const DAY = 24 * 60 * 60 * 1000;

/** Toshkent kunining boshi (UTC+5) — hisobotlar mahalliy kun bo'yicha. */
function startOfPeriod(period: string): Date {
  const now = new Date();
  const local = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 5 * 60 * 60 * 1000;
  if (period === 'week') return new Date(midnight - 6 * DAY);
  if (period === 'month') return new Date(midnight - 29 * DAY);
  return new Date(midnight);
}

/** To'g'ri masofa (km) — tarif hisobida shahar koeffitsiyenti bilan. */
function distanceKm(aLat?: number | null, aLng?: number | null, bLat?: number | null, bLng?: number | null) {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(Number(bLat) - Number(aLat));
  const dLng = rad(Number(bLng) - Number(aLng));
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(Number(aLat))) * Math.cos(rad(Number(bLat))) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * 1.4; // shahar yo'llari
}

/**
 * Smena, daromad, tarif va hisob-kitob (topshiriq №26, 6- va 8-band).
 *
 * `deliveries.delivery_fee` ustuni №22 dan beri bor edi, lekin hech qayerda
 * ishlatilmasdi: kuryer qancha ishlaganini bilmasdi, do'kon esa qancha
 * to'lashni qo'lda hisoblardi.
 */
@Injectable()
export class CourierWorkService {
  constructor(private readonly vehicles: CourierVehiclesService) {}

  // ============================================================ 8-band: smena
  async startShift(courier: Courier, dto: ShiftStartDto) {
    const open = await CourierShift.findOne({ where: { courier_id: courier.id, ended_at: null } });
    if (open) throw new ConflictException('Smena allaqachon ochiq');

    // Transport tanlash qoidalari `activate` bilan AYNAN bir xil
    // (tasdiqlangan, guvohnoma toifasi mos, faol yetkazish yo'q).
    const vehicle = await this.vehicles.activate(courier, dto.vehicle_id, {
      type: 'courier',
      id: courier.store_user_id,
    });

    const shift = await CourierShift.create({
      courier_id: courier.id,
      vehicle_id: vehicle.id,
      started_at: new Date(),
      start_lat: dto.lat ?? null,
      start_lng: dto.lng ?? null,
    } as any);
    // `is_online` smenadan AVTOMATIK — kuryer alohida tugma bosmaydi
    await courier.update({
      is_online: true,
      ...(dto.lat != null && dto.lng != null
        ? { last_lat: dto.lat, last_lng: dto.lng, last_seen_at: new Date() }
        : {}),
    } as any);
    return { shift, vehicle };
  }

  async endShift(courier: Courier, dto: ShiftEndDto) {
    const shift = await CourierShift.findOne({ where: { courier_id: courier.id, ended_at: null } });
    if (!shift) throw new ConflictException('Ochiq smena yo\'q');
    const active = await Delivery.count({
      where: { courier_id: courier.id, status: { [Op.in]: ACTIVE_STATUSES } },
    });
    if (active) {
      throw new ConflictException(`Qo'lingizda ${active} ta faol yetkazish bor — avval yakunlang`);
    }
    await shift.update({ ended_at: new Date(), end_lat: dto.lat ?? null, end_lng: dto.lng ?? null });
    await courier.update({ is_online: false } as any);
    return shift;
  }

  async shifts(courier: Courier, q: { from?: string; to?: string }) {
    const where: any = { courier_id: courier.id };
    const range: any = {};
    if (q.from && !isNaN(Date.parse(q.from))) range[Op.gte] = new Date(q.from);
    if (q.to && !isNaN(Date.parse(q.to))) range[Op.lte] = new Date(q.to);
    if (Object.getOwnPropertySymbols(range).length) where.started_at = range;
    const rows = await CourierShift.findAll({ where, order: [['started_at', 'DESC']], limit: 100 });
    return rows.map((s) => ({
      ...s.get({ plain: true }),
      minutes: s.ended_at
        ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
        : null,
    }));
  }

  /** Adminka: kuryer qachon ishga chiqib qachon ketgani. */
  async shiftsOf(courierId: number, q: { from?: string; to?: string }) {
    const courier = await Courier.findByPk(courierId);
    if (!courier) throw new NotFoundException('Kuryer topilmadi');
    return this.shifts(courier, q);
  }

  // ============================================================ 6-band: daromad
  async earnings(courier: Courier, period: string) {
    const from = startOfPeriod(['today', 'week', 'month'].includes(period) ? period : 'today');
    const [totals]: any[] = await Delivery.sequelize.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
              COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
              COALESCE(SUM(delivery_fee) FILTER (WHERE status = 'delivered'), 0)::bigint AS fees_total,
              COALESCE(SUM(cash_collected) FILTER (WHERE status = 'delivered'), 0)::bigint AS cash_collected,
              COALESCE(SUM(fee_cash_collected) FILTER (WHERE status = 'delivered'), 0)::bigint AS fee_cash_collected
         FROM deliveries
        WHERE courier_id = :id AND updated_at >= :from`,
      { replacements: { id: courier.id, from }, type: QueryTypes.SELECT },
    );
    const days: any[] = await Delivery.sequelize.query(
      `SELECT (delivered_at AT TIME ZONE 'Asia/Tashkent')::date AS date,
              COUNT(*)::int AS delivered,
              COALESCE(SUM(delivery_fee), 0)::bigint AS fees
         FROM deliveries
        WHERE courier_id = :id AND status = 'delivered' AND delivered_at >= :from
        GROUP BY 1 ORDER BY 1`,
      { replacements: { id: courier.id, from }, type: QueryTypes.SELECT },
    );
    // Naqd balans — HAMMA vaqt uchun (davr bilan cheklanmaydi): kuryer
    // qo'lida qancha pul borligi davr chegarasiga bog'liq emas. Mijoz to'lagan
    // yetkazish haqi (`fee_cash_collected`, №47) ham shu yerda — u Climavent'niki.
    const [cash]: any[] = await Delivery.sequelize.query(
      `SELECT COALESCE((SELECT SUM(COALESCE(cash_collected, 0) + COALESCE(fee_cash_collected, 0)) FROM deliveries
                         WHERE courier_id = :id AND status = 'delivered'), 0)::bigint AS collected,
              COALESCE((SELECT SUM(amount) FROM cash_handovers WHERE courier_id = :id), 0)::bigint AS handed_over`,
      { replacements: { id: courier.id }, type: QueryTypes.SELECT },
    );
    const collected = Number(cash.collected);
    const handedOver = Number(cash.handed_over);
    return {
      period,
      from,
      delivered: Number(totals.delivered),
      failed: Number(totals.failed),
      fees_total: Number(totals.fees_total),
      // Davr ichida mijozdan olingan yetkazish haqi (cod dan alohida)
      fee_cash_collected: Number(totals.fee_cash_collected),
      cash_collected: collected,
      cash_handed_over: handedOver,
      cash_balance: collected - handedOver,
      days: days.map((d) => ({ date: d.date, delivered: Number(d.delivered), fees: Number(d.fees) })),
    };
  }

  // ============================================================ 6-band: hisob-kitob
  async payouts(courierId: number, r: StoreRequester) {
    await this.ownedCourier(courierId, r);
    const rows = await CourierPayout.findAll({
      where: { courier_id: courierId },
      order: [['created_at', 'DESC']],
      limit: 100,
    });
    const total = rows.reduce((s, p) => s + Number(p.amount), 0);
    return { courier_id: courierId, total_paid: total, payouts: rows };
  }

  async addPayout(courierId: number, dto: CourierPayoutDto, r: StoreRequester) {
    await this.ownedCourier(courierId, r);
    if (dto.period_from && dto.period_to && dto.period_from > dto.period_to) {
      throw new BadRequestException("period_to period_from dan keyin bo'lsin");
    }
    const row = await CourierPayout.create({
      courier_id: courierId,
      amount: dto.amount,
      period_from: dto.period_from ?? null,
      period_to: dto.period_to ?? null,
      comment: dto.comment?.trim() || null,
      paid_by: r?.user_id ?? null,
      paid_by_login: r?.login ?? (r?.user_id ? null : 'service-key'),
    } as any);
    return row;
  }

  // ============================================================ 6-band: tariflar (№47: sinf bo'yicha)
  async listRates(r: StoreRequester) {
    const where: any = {};
    if (r?.role !== 'superadmin') {
      // Do'kon admini o'z tarifini va platforma tarifini ko'radi
      where[Op.or] = [{ store_id: r.store_id }, { store_id: null }];
    }
    const rows = await CourierRate.findAll({ where, order: [['store_id', 'ASC NULLS FIRST'], ['vehicle_type', 'ASC'], ['id', 'ASC']] });
    // Adminka «Tariflar» sahifasi 7 sinfni tartib bilan ko'rsatsin
    const rank = (c: string | null) => (c && isVehicleClass(c) ? Object.keys(CLASS_SPEC).indexOf(c) : -1);
    return rows.sort((a, b) => (a.store_id ?? 0) - (b.store_id ?? 0) || rank(a.vehicle_class) - rank(b.vehicle_class));
  }

  async upsertRate(dto: CourierRateDto, r: StoreRequester) {
    const isSuper = r?.role === 'superadmin';
    let storeId: number | null;
    if (isSuper) {
      storeId = dto.store_id ?? null;
    } else {
      if (dto.store_id !== undefined && dto.store_id !== null && Number(dto.store_id) !== Number(r.store_id)) {
        throw new ForbiddenException("Faqat o'z do'koningiz tarifini qo'ya olasiz");
      }
      if (dto.store_id === null) {
        throw new ForbiddenException('Platforma tarifini faqat superadmin qo\'yadi');
      }
      storeId = Number(r.store_id);
    }
    const key = rateKey(dto.vehicle_class, dto.vehicle_type);
    const [row] = await CourierRate.findOrCreate({
      where: { store_id: storeId, ...(key.vehicle_class ? { vehicle_class: key.vehicle_class } : { vehicle_class: null, vehicle_type: key.vehicle_type }) },
      defaults: {
        store_id: storeId,
        vehicle_type: key.vehicle_type,
        vehicle_class: key.vehicle_class,
        base_fee: dto.base_fee,
        per_km: dto.per_km,
        floor_fee: dto.floor_fee,
        wait_fee_per_15min: dto.wait_fee_per_15min,
        loader_fee: dto.loader_fee ?? 0,
      } as any,
    });
    await row.update({
      base_fee: dto.base_fee,
      per_km: dto.per_km,
      floor_fee: dto.floor_fee,
      wait_fee_per_15min: dto.wait_fee_per_15min,
      ...(dto.loader_fee !== undefined ? { loader_fee: dto.loader_fee } : {}),
      is_active: true,
    } as any);
    return row;
  }

  /**
   * Yetkazish yaratilganda taklif qilinadigan haq (6-band).
   * Do'kon tarifi bo'lmasa platforma tarifi; u ham bo'lmasa `null`
   * (adminkada qo'lda kiritiladi). Kalit — sinf (№47), sinfsiz — `vehicle_type`.
   */
  async suggestFee(input: FeeInput & { store_id: number }): Promise<number | null> {
    const key = rateKey(input.vehicle_class, input.vehicle_type);
    const rates = await CourierRate.findAll({
      where: { ...rateWhere(key), is_active: true, [Op.or]: [{ store_id: input.store_id }, { store_id: null }] },
    });
    if (!rates.length) return null;
    // Do'kon tarifi platformanikidan ustun
    const rate = rates.find((x) => x.store_id !== null) ?? rates[0];
    // Do'konning o'z kuryeri — yuklovchi alohida kelishiladi (№26 dagi kabi)
    return feeFromRate(rate, { ...input, loaders_needed: 0 }).delivery_fee;
  }

  /**
   * Platforma tarifi (№44, 3.4): FAQAT `store_id = null` qatorlari — kuryerga platforma
   * to'laydi. Tarif yo'q sinf — `delivery_fee: null` (№47: `options` da chiqmaydi).
   */
  async platformFee(input: FeeInput): Promise<{ delivery_fee: number | null; distance_km: number | null }> {
    const rate = await CourierRate.findOne({ where: { store_id: null, ...rateWhere(rateKey(input.vehicle_class, input.vehicle_type)), is_active: true } });
    if (!rate) {
      const km = distanceKm(input.pickup_lat, input.pickup_lng, input.dropoff_lat, input.dropoff_lng);
      return { delivery_fee: null, distance_km: km === null ? null : Math.round(km * 10) / 10 };
    }
    return feeFromRate(rate, input);
  }

  /** Har sinf uchun platforma narxi (№47, 3-bo'lim) — tarifi bor sinflargina. */
  async platformOptions(input: Omit<FeeInput, 'vehicle_class' | 'vehicle_type'>) {
    const rates = await CourierRate.findAll({ where: { store_id: null, is_active: true, vehicle_class: { [Op.ne]: null } } });
    const out: { class: VehicleClass; vehicle_type: string; delivery_fee: number; distance_km: number | null }[] = [];
    for (const cls of Object.keys(CLASS_SPEC) as VehicleClass[]) {
      const rate = rates.find((x) => x.vehicle_class === cls);
      if (!rate) continue;
      const fee = feeFromRate(rate, input);
      out.push({ class: cls, vehicle_type: CLASS_SPEC[cls].vehicle_type, delivery_fee: fee.delivery_fee, distance_km: fee.distance_km });
    }
    return out;
  }

  /** Kutish haqi — `arrived_at` dan topshirishgacha (6-band). */
  async waitFee(delivery: Delivery): Promise<number> {
    if (!delivery.arrived_at) return 0;
    const rate = await CourierRate.findOne({
      where: {
        ...rateWhere(rateKey(delivery.vehicle_class, delivery.required_vehicle)),
        is_active: true,
        [Op.or]: [{ store_id: delivery.store_id }, { store_id: null }],
      },
      order: [['store_id', 'ASC NULLS LAST']],
    });
    if (!rate || !Number(rate.wait_fee_per_15min)) return 0;
    const minutes = Math.floor((Date.now() - new Date(delivery.arrived_at).getTime()) / 60000);
    return Math.floor(minutes / 15) * Number(rate.wait_fee_per_15min);
  }

  // ============================================================ ichki
  private async ownedCourier(id: number, r: StoreRequester) {
    const courier = await Courier.findByPk(id);
    if (!courier) throw new NotFoundException('Kuryer topilmadi');
    if (r?.role !== 'superadmin' && Number(courier.store_id) !== Number(r?.store_id)) {
      throw new ForbiddenException("Bu kuryer boshqa do'konga tegishli");
    }
    return courier;
  }
}

export interface FeeInput {
  vehicle_class?: string | null;
  vehicle_type?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  floor?: number | null;
  has_elevator?: boolean | null;
  loaders_needed?: number | null;
}

/**
 * Tarif kaliti (№47, 5-bo'lim): sinf; sinfsiz eski so'rov — `vehicle_type` dan eng
 * yaqin sinf (migratsiya mavjud qatorlarni aynan shunday ko'chirgan). `foot`/`bike`
 * — sinfi yo'q, `vehicle_type` bo'yicha.
 */
export function rateKey(vehicleClass?: string | null, vehicleType?: string | null): { vehicle_class: VehicleClass | null; vehicle_type: string } {
  if (isVehicleClass(vehicleClass)) {
    const type = CLASS_SPEC[vehicleClass].vehicle_type;
    if (vehicleType && vehicleType !== type) {
      throw new BadRequestException(`vehicle_type (${vehicleType}) ${vehicleClass} sinfiga mos emas — ${type} bo'lishi kerak`);
    }
    return { vehicle_class: vehicleClass, vehicle_type: type };
  }
  if (!vehicleType) throw new BadRequestException('vehicle_class yoki vehicle_type majburiy');
  return { vehicle_class: classOf(null, vehicleType), vehicle_type: vehicleType };
}

const rateWhere = (key: { vehicle_class: string | null; vehicle_type: string }) =>
  key.vehicle_class ? { vehicle_class: key.vehicle_class } : { vehicle_class: null, vehicle_type: key.vehicle_type };

/** Narx formulasi — yagona joy: asos + km + liftsiz qavat + yuklovchilar. */
function feeFromRate(rate: CourierRate, input: FeeInput): { delivery_fee: number; distance_km: number | null } {
  const km = distanceKm(input.pickup_lat, input.pickup_lng, input.dropoff_lat, input.dropoff_lng);
  let fee = Number(rate.base_fee) + (km !== null ? Math.round(km * Number(rate.per_km)) : 0);
  // Liftsiz binoda har qavat uchun qo'shimcha (1-qavat bepul)
  if (input.floor && !input.has_elevator) fee += Math.max(0, Number(input.floor) - 1) * Number(rate.floor_fee);
  fee += Math.max(0, Number(input.loaders_needed || 0)) * Number(rate.loader_fee || 0);
  return { delivery_fee: fee, distance_km: km === null ? null : Math.round(km * 10) / 10 };
}


export { distanceKm };
export type { CourierVehicle };
