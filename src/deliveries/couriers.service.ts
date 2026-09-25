import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Op, QueryTypes, UniqueConstraintError } from 'sequelize';
import { StoreUser } from 'src/store_users/model/store_user.model';
import { PasswordSetupService } from 'src/store_auth/password-setup.service';
import type { StoreRequester } from 'src/store_auth/store_auth.guard';
import { revokeAllRefreshTokens } from 'src/store_auth/mobile-session';
import { ACTIVE_STATUSES } from './constants';
import { CashHandover, Courier, CourierVehicle, CourierVehicleEvent, Delivery } from './model/models';
import { CashHandoverDto, CreateCourierDto, UpdateCourierDto } from './dto/dto';
import { pushToStoreAdmins } from './push';
import { dropDeviceTokens } from './store-push';

/**
 * Kuryerlar (topshiriq №22, 1-band).
 *
 * Ruxsat (backendda, №19 dagi sharh xatosi takrorlanmasin):
 *   superadmin    — hammasi; istalgan `store_id` yoki null (platforma kuryeri);
 *   do'kon admini — faqat O'Z do'koni kuryerlari; boshqasi 403, platforma kuryeri ham.
 */
@Injectable()
export class CouriersService {
  constructor(private readonly setupLinks: PasswordSetupService) {}

  isSuper = (r: StoreRequester) => r?.role === 'superadmin';

  /** Kuryerni oladi va huquqni tekshiradi. Begona — 403 (borligini yashirmaymiz: adminka o'z ro'yxatini biladi). */
  async getOwned(id: number, r: StoreRequester) {
    const courier = await Courier.findByPk(id);
    if (!courier) throw new NotFoundException('Kuryer topilmadi');
    if (!this.isSuper(r) && Number(courier.store_id) !== Number(r.store_id)) {
      throw new ForbiddenException("Bu kuryer boshqa do'konga tegishli");
    }
    return courier;
  }

  async list(r: StoreRequester, q: { store_id?: string; is_active?: string; is_online?: string; skill?: string }) {
    const where: any = {};
    // `?skill=installation` — shu ishni qila oladiganlar (№39, 2-band)
    if (q.skill) where.skills = { [Op.contains]: [String(q.skill)] };
    if (!this.isSuper(r)) where.store_id = r.store_id;
    else if (q.store_id === 'null') where.store_id = null;
    else if (q.store_id) where.store_id = Number(q.store_id);
    if (q.is_active === 'true' || q.is_active === 'false') where.is_active = q.is_active === 'true';
    if (q.is_online === 'true' || q.is_online === 'false') where.is_online = q.is_online === 'true';
    const rows = await Courier.findAll({ where, order: [['is_active', 'DESC'], ['full_name', 'ASC']] });
    const logins = await this.loginsOf(rows.map((c) => c.store_user_id));
    // Faol transport ro'yxatda ham ko'rinsin (topshiriq №26, 1a-band):
    // adminka "kim nima bilan yurayapti" ni bitta so'rovda ko'rsatadi.
    const vehicleIds = rows.map((c) => c.active_vehicle_id).filter(Boolean) as number[];
    const vehicles = vehicleIds.length
      ? await CourierVehicle.findAll({ where: { id: { [Op.in]: vehicleIds } } })
      : [];
    const byId = new Map(vehicles.map((v) => [v.id, v.get({ plain: true })]));
    return rows.map((c) => ({
      ...c.get({ plain: true }),
      login: logins.get(c.store_user_id) ?? null,
      active_vehicle: c.active_vehicle_id ? byId.get(c.active_vehicle_id) ?? null : null,
      documents_ok: !!c.documents_verified_at,
    }));
  }

  /**
   * Ko'nikmalar (№39, 2-band): `delivery` yoki MAVJUD xizmat turi kaliti.
   * Takrorlar olib tashlanadi; noma'lum kalit — 400.
   */
  async normalizeSkills(input: string[] | undefined | null): Promise<string[] | undefined> {
    if (input === undefined || input === null) return undefined;
    const list = [...new Set(input.map((x) => String(x).trim()).filter(Boolean))];
    if (!list.length) throw new BadRequestException("skills bo'sh bo'lmasin");
    const rows: any[] = await Courier.sequelize.query('SELECT key FROM service_categories', { type: QueryTypes.SELECT });
    const known = new Set(['delivery', ...rows.map((x) => String(x.key))]);
    const unknown = list.filter((x) => !known.has(x));
    if (unknown.length) throw new BadRequestException(`Noma'lum ko'nikma: ${unknown.join(', ')}`);
    return list;
  }

  async create(dto: CreateCourierDto, r: StoreRequester) {
    const skills = (await this.normalizeSkills(dto.skills)) ?? ['delivery'];
    // Yetkazadigan odamga transport kerak; faqat usta bo'lsa — ixtiyoriy
    if (skills.includes('delivery') && !dto.vehicle_type) {
      throw new BadRequestException("vehicle_type majburiy: skills da 'delivery' bor");
    }
    let storeId: number | null;
    if (this.isSuper(r)) {
      storeId = dto.store_id ?? null;
    } else {
      if (dto.store_id !== undefined && Number(dto.store_id) !== Number(r.store_id)) {
        throw new ForbiddenException("Faqat o'z do'koningizga kuryer qo'sha olasiz");
      }
      storeId = Number(r.store_id);
    }
    if (storeId !== null) {
      const [store]: any[] = await Courier.sequelize.query('SELECT id FROM stores WHERE id = :id', {
        replacements: { id: storeId },
        type: QueryTypes.SELECT,
      });
      if (!store) throw new BadRequestException("Bunday do'kon yo'q (store_id)");
    }

    // Yakka usta (№39, 2-band): hamkor admini ham, usta ham — BITTA hisob.
    // Ikkinchi login ochilmaydi, mavjud hisobga usta profili ulanadi.
    if (dto.store_user_id !== undefined) return this.attachToAccount(dto, skills, storeId, r);

    const login = dto.login || `c${dto.phone.replace(/\D/g, '')}`;
    try {
      return await Courier.sequelize.transaction(async (transaction) => {
        const account = await StoreUser.create(
          {
            login,
            full_name: dto.full_name,
            role: 'courier',
            store_id: storeId,
            is_active: true,
            password_hash: null, // parol — bir martalik havola orqali (chatda parol yurmaydi)
          } as any,
          { transaction },
        );
        const courier = await Courier.create(
          {
            store_user_id: account.id,
            store_id: storeId,
            full_name: dto.full_name,
            phone: dto.phone,
            vehicle_type: dto.vehicle_type ?? null,
            skills,
            // Topshiriq №26, 1-band: bandlik turi va STIR soliq uchun,
            // guvohnoma toifasi — transportni faollashtirishda tekshiriladi
            employment_type: dto.employment_type ?? null,
            tin: dto.tin ?? null,
            license_categories: (dto.license_categories || []).map((c) => c.toUpperCase()),
          } as any,
          { transaction },
        );
        // Kuryer bo'sh ro'yxat bilan qolmasin: yaratishda ko'rsatilgan
        // transport darhol tasdiqlangan holda qo'shiladi va faol bo'ladi
        // (admin uni allaqachon bilib turibdi — 1a-band). Transportsiz usta — yo'q.
        if (dto.vehicle_type) await this.addInitialVehicle(courier, dto.vehicle_type, r, transaction);
        const setup = await this.setupLinks.issue(account.id, transaction);
        return {
          courier: { ...courier.get({ plain: true }), login },
          password_setup_token: setup.password_setup_token,
          password_setup_expires_at: setup.expires_at,
        };
      });
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        const f = Object.keys((e as any).fields || {}).join(',');
        if (f.includes('phone')) throw new ConflictException('Bu telefon bilan kuryer allaqachon bor');
        throw new ConflictException('Bu login band');
      }
      throw e;
    }
  }

  /** Yaratishda ko'rsatilgan transport — darhol tasdiqlangan va faol. */
  private async addInitialVehicle(courier: Courier, vehicleType: string, r: StoreRequester, transaction: any) {
    const vehicle = await CourierVehicle.create(
      {
        courier_id: courier.id,
        vehicle_type: vehicleType,
        owner: 'own',
        status: 'approved',
        verified_at: new Date(),
        verified_by: r?.user_id ?? null,
      } as any,
      { transaction },
    );
    await CourierVehicleEvent.create(
      {
        vehicle_id: vehicle.id,
        courier_id: courier.id,
        from_status: null,
        to_status: 'approved',
        actor_type: this.isSuper(r) ? 'superadmin' : 'store',
        actor_id: r?.user_id ?? null,
        comment: 'Kuryer yaratilganda',
        created_at: new Date(),
      } as any,
      { transaction },
    );
    await courier.update({ active_vehicle_id: vehicle.id } as any, { transaction });
  }

  /**
   * Yakka usta: mavjud hisobga (odatda `store_admin`) usta profilini ulaydi.
   * Hisob shu do'konniki va faol bo'lishi, profili hali yo'q bo'lishi shart.
   * Rol o'zgarmaydi — hisob hamkor paneliga ham, `/api/worker/*` ga ham kiradi.
   */
  private async attachToAccount(dto: CreateCourierDto, skills: string[], storeId: number | null, r: StoreRequester) {
    const account = await StoreUser.findByPk(dto.store_user_id);
    if (!account || !account.is_active) throw new NotFoundException('Hisob topilmadi (store_user_id)');
    if (!['store_admin', 'store_staff'].includes(account.role)) {
      throw new BadRequestException('store_user_id: faqat hamkor admini yoki xodimi hisobiga ulanadi');
    }
    if (storeId === null || Number(account.store_id) !== Number(storeId)) {
      throw new ForbiddenException("Hisob boshqa do'konga tegishli");
    }
    try {
      return await Courier.sequelize.transaction(async (transaction) => {
        const courier = await Courier.create(
          {
            store_user_id: account.id,
            store_id: storeId,
            full_name: dto.full_name,
            phone: dto.phone,
            vehicle_type: dto.vehicle_type ?? null,
            skills,
            employment_type: dto.employment_type ?? null,
            tin: dto.tin ?? null,
            license_categories: (dto.license_categories || []).map((c) => c.toUpperCase()),
          } as any,
          { transaction },
        );
        if (dto.vehicle_type) await this.addInitialVehicle(courier, dto.vehicle_type, r, transaction);
        // Parol havolasi kerak emas — hisobning o'z paroli bor
        return { courier: { ...courier.get({ plain: true }), login: account.login }, attached_to: account.id };
      });
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        const f = Object.keys((e as any).fields || {}).join(',');
        if (f.includes('phone')) throw new ConflictException('Bu telefon bilan kuryer allaqachon bor');
        throw new ConflictException('Bu hisobda usta profili allaqachon bor');
      }
      throw e;
    }
  }

  async update(id: number, dto: UpdateCourierDto, r: StoreRequester) {
    const courier = await this.getOwned(id, r);
    const payload: any = {};
    for (const k of ['full_name', 'phone', 'vehicle_type', 'employment_type', 'tin'] as const) {
      if (dto[k] !== undefined) payload[k] = dto[k];
    }
    if (dto.license_categories !== undefined) {
      payload.license_categories = (dto.license_categories || []).map((c) => c.toUpperCase());
    }
    if (dto.skills !== undefined) {
      payload.skills = await this.normalizeSkills(dto.skills);
      // Qo'lidagi ish/yetkazishni bajara olmay qolmasin
      if (!payload.skills.includes('delivery')) {
        await this.ensureNoActive(courier.id, "Faol yetkazishi bor kuryerdan 'delivery' ni olib bo'lmaydi");
      }
      const [busy]: any[] = await Courier.sequelize.query(
        `SELECT COUNT(*)::int AS n FROM service_jobs j
          WHERE j.worker_id = :id AND j.status IN ('assigned', 'accepted', 'on_the_way', 'arrived', 'in_progress')
            AND EXISTS (SELECT 1 FROM "order-items" i
                          JOIN services s ON s.id = i.service_id
                          JOIN service_categories c ON c.id = s.category_id
                         WHERE i.id = ANY(j.items) AND c.key NOT IN (:skills))`,
        { replacements: { id: courier.id, skills: payload.skills }, type: QueryTypes.SELECT },
      );
      if (Number(busy?.n) > 0) throw new ConflictException("Faol ishi talab qilgan ko'nikmani olib bo'lmaydi");
    }

    if (dto.store_id !== undefined && dto.store_id !== courier.store_id) {
      if (!this.isSuper(r)) throw new ForbiddenException("Kuryerni boshqa do'konga faqat superadmin o'tkaza oladi");
      await this.ensureNoActive(courier.id, "Faol yetkazishi bor kuryerni boshqa do'konga o'tkazib bo'lmaydi");
      await this.ensureNoActiveJob(courier.id, "Faol ishi bor ustani boshqa do'konga o'tkazib bo'lmaydi");
      payload.store_id = dto.store_id;
    }
    if (dto.vehicle_type !== undefined && dto.vehicle_type !== courier.vehicle_type) {
      // Biriktirilgan yetkazish talab qilgan transportdan kichigiga tushirilmasin
      const active = await Delivery.findAll({ where: { courier_id: courier.id, status: { [Op.in]: ACTIVE_STATUSES } } });
      const { vehicleFits } = await import('./constants');
      if (active.some((d) => !vehicleFits(dto.vehicle_type, d.required_vehicle))) {
        throw new ConflictException("Faol yetkazish bu transportdan kattasini talab qiladi");
      }
    }

    try {
      await Courier.sequelize.transaction(async (transaction) => {
        if (dto.is_active !== undefined && dto.is_active !== courier.is_active) {
          if (dto.is_active === false) {
            await this.ensureNoActive(courier.id, "Faol yetkazishi bor kuryerni o'chirib bo'lmaydi");
            await this.ensureNoActiveJob(courier.id, "Faol ishi bor ustani o'chirib bo'lmaydi");
            payload.is_online = false;
          }
          payload.is_active = dto.is_active;
          await this.bumpSessions(courier.store_user_id, dto.is_active, transaction);
        }
        if (payload.store_id !== undefined) {
          await StoreUser.update({ store_id: payload.store_id } as any, { where: { id: courier.store_user_id }, transaction });
        }
        if (payload.full_name) {
          await StoreUser.update({ full_name: payload.full_name } as any, { where: { id: courier.store_user_id }, transaction });
        }
        await courier.update(payload, { transaction });
      });
    } catch (e) {
      if (e instanceof UniqueConstraintError) throw new ConflictException('Bu telefon bilan kuryer allaqachon bor');
      throw e;
    }
    return courier.reload();
  }

  /** O'chirish = nofaol qilish (tarix saqlanadi). Faol yetkazishi bo'lsa — 409. */
  async remove(id: number, r: StoreRequester) {
    const courier = await this.getOwned(id, r);
    await this.ensureNoActive(courier.id, "Faol yetkazishi bor kuryerni o'chirib bo'lmaydi");
    await this.ensureNoActiveJob(courier.id, "Faol ishi bor ustani o'chirib bo'lmaydi");
    await Courier.sequelize.transaction(async (transaction) => {
      await courier.update({ is_active: false, is_online: false }, { transaction });
      await this.bumpSessions(courier.store_user_id, false, transaction);
    });
    return { message: 'Kuryer nofaol qilindi', id: courier.id };
  }

  async passwordSetup(id: number, r: StoreRequester) {
    const courier = await this.getOwned(id, r);
    return this.setupLinks.issue(courier.store_user_id);
  }

  // ============================================================ naqd pul (9-band)
  async cashBalance(courierId: number) {
    const [row]: any[] = await Courier.sequelize.query(
      `SELECT
         (COALESCE((SELECT SUM(cash_collected) FROM deliveries WHERE courier_id = :id AND status = 'delivered'), 0)
          + COALESCE((SELECT SUM(cash_collected) FROM service_jobs WHERE worker_id = :id AND status IN ('completed', 'failed')), 0))::bigint AS collected,
         COALESCE((SELECT SUM(amount) FROM cash_handovers WHERE courier_id = :id), 0)::bigint AS handed_over`,
      { replacements: { id: courierId }, type: QueryTypes.SELECT },
    );
    const collected = Number(row.collected);
    const handedOver = Number(row.handed_over);
    return { courier_id: courierId, collected, handed_over: handedOver, balance: collected - handedOver };
  }

  async cash(id: number, r: StoreRequester) {
    const courier = await this.getOwned(id, r);
    const balance = await this.cashBalance(courier.id);
    const handovers = await CashHandover.findAll({ where: { courier_id: courier.id }, order: [['created_at', 'DESC']], limit: 20 });
    return { ...balance, handovers };
  }

  async handover(id: number, dto: CashHandoverDto, r: StoreRequester) {
    const courier = await this.getOwned(id, r);
    const { balance } = await this.cashBalance(courier.id);
    if (dto.amount > balance) {
      throw new BadRequestException(`Kuryer qo'lida ${balance} so'm — undan ko'p qabul qilib bo'lmaydi`);
    }
    const row = await CashHandover.create({
      courier_id: courier.id,
      amount: dto.amount,
      comment: dto.comment?.trim() || null,
      received_by_store_user_id: r.user_id ?? null,
      received_by_login: r.login ?? (r.user_id ? null : 'service-key'),
    } as any);
    return { handover: row, ...(await this.cashBalance(courier.id)) };
  }

  /** 24 soatdan ortiq topshirilmagan naqd — adminlarga push, kuniga bir marta. */
  async remindCash() {
    const rows: any[] = await Courier.sequelize.query(
      `SELECT c.id, c.full_name, c.store_id,
              COALESCE((SELECT SUM(cash_collected) FROM deliveries d WHERE d.courier_id = c.id AND d.status = 'delivered'), 0)
            + COALESCE((SELECT SUM(cash_collected) FROM service_jobs j WHERE j.worker_id = c.id AND j.status IN ('completed', 'failed')), 0)
            - COALESCE((SELECT SUM(amount) FROM cash_handovers h WHERE h.courier_id = c.id), 0) AS balance
         FROM couriers c
        WHERE (c.cash_reminded_at IS NULL OR c.cash_reminded_at < now() - interval '24 hours')
          AND (EXISTS (SELECT 1 FROM deliveries d WHERE d.courier_id = c.id AND d.status = 'delivered'
                        AND COALESCE(d.cash_collected, 0) > 0 AND d.delivered_at < now() - interval '24 hours'
                        AND d.delivered_at > COALESCE((SELECT MAX(created_at) FROM cash_handovers h WHERE h.courier_id = c.id), 'epoch'))
           OR EXISTS (SELECT 1 FROM service_jobs j WHERE j.worker_id = c.id AND j.status IN ('completed', 'failed')
                        AND COALESCE(j.cash_collected, 0) > 0
                        AND COALESCE(j.completed_at, j.failed_at) < now() - interval '24 hours'
                        AND COALESCE(j.completed_at, j.failed_at) > COALESCE((SELECT MAX(created_at) FROM cash_handovers h WHERE h.courier_id = c.id), 'epoch')))`,
      { type: QueryTypes.SELECT },
    );
    let n = 0;
    for (const c of rows) {
      if (Number(c.balance) <= 0) continue;
      const msg = { title: 'Naqd pul topshirilmagan', body: `${c.full_name}: ${Number(c.balance)} so'm 24 soatdan ortiq`, data: { type: 'cash', courier_id: c.id } };
      if (c.store_id) await pushToStoreAdmins([c.store_id], msg);
      await Courier.update({ cash_reminded_at: new Date() } as any, { where: { id: c.id } });
      n++;
    }
    return n;
  }

  // ============================================================ yordamchilar
  private async ensureNoActive(courierId: number, message: string) {
    const active = await Delivery.count({ where: { courier_id: courierId, status: { [Op.in]: ACTIVE_STATUSES } } });
    if (active) throw new ConflictException(message);
  }

  /** Faol ish (№39) — nofaol qilish va boshqa do'konga o'tkazishda. */
  private async ensureNoActiveJob(courierId: number, message: string) {
    const [row]: any[] = await Courier.sequelize.query(
      `SELECT COUNT(*)::int AS n FROM service_jobs
        WHERE worker_id = :id AND status IN ('assigned', 'accepted', 'on_the_way', 'arrived', 'in_progress')`,
      { replacements: { id: courierId }, type: QueryTypes.SELECT },
    );
    if (Number(row?.n) > 0) throw new ConflictException(message);
  }

  /** Nofaol qilinganda (yoki qayta yoqilganda) eski tokenlar va mobil sessiyalar o'ladi. */
  private async bumpSessions(storeUserId: number, active: boolean, transaction: any) {
    const user = await StoreUser.findByPk(storeUserId, { transaction });
    if (!user) return;
    await user.update({ token_version: (user.token_version ?? 0) + 1, is_active: active } as any, { transaction });
    await revokeAllRefreshTokens(storeUserId);
    // Nofaol qilingan hisobga push kelmasin (topshiriq №31 qoidasi)
    if (!active) await dropDeviceTokens('store_user', storeUserId);
  }

  private async loginsOf(ids: number[]) {
    if (!ids.length) return new Map<number, string>();
    const users = await StoreUser.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'login'] });
    return new Map(users.map((u) => [u.id, u.login]));
  }
}
