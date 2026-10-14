import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Op, Transaction, UniqueConstraintError } from 'sequelize';
import type { StoreRequester } from 'src/store_auth/store_auth.guard';
import { ACTIVE_STATUSES, LICENSE_FOR_VEHICLE } from './constants';
import { Courier, CourierVehicle, CourierVehicleEvent, Delivery } from './model/models';
import { ApproveVehicleDto, CourierVehicleDto, UpdateCourierVehicleDto } from './dto/dto';
import { pushToStoreAdmins } from './push';
import { CLASS_SPEC, isVehicleClass, vehicleCapacity } from './vehicle-classes';

/**
 * Sinf va tur (№47, 2-bo'lim): sinf berilsa tur shundan olinadi (farq qilsa 400);
 * faqat tur — sinf `null` (eski yozuv, birjada eng kichik mos sinf deb hisoblanadi).
 */
function resolveClass(dto: { vehicle_class?: string | null; vehicle_type?: string | null }) {
  if (isVehicleClass(dto.vehicle_class)) {
    const type = CLASS_SPEC[dto.vehicle_class].vehicle_type;
    if (dto.vehicle_type && dto.vehicle_type !== type) {
      throw new BadRequestException(`vehicle_type (${dto.vehicle_type}) ${dto.vehicle_class} sinfiga mos emas — ${type}`);
    }
    return { vehicle_class: dto.vehicle_class, vehicle_type: type };
  }
  if (!dto.vehicle_type) throw new BadRequestException('vehicle_class yoki vehicle_type majburiy');
  return { vehicle_class: null, vehicle_type: dto.vehicle_type };
}

/** Javobda amaldagi sig'im ham — kuryer ilovasi «Transportim» ko'rsatadi. */
const withCapacity = (v: CourierVehicle, activeId: number | null) => {
  const cap = vehicleCapacity(v);
  return {
    ...v.get({ plain: true }),
    is_active: Number(activeId) === Number(v.id),
    effective_class: cap.vehicle_class,
    effective_capacity_kg: cap.kg,
    effective_capacity_m3: cap.m3,
  };
};

/**
 * "Mening transportim" (topshiriq №26, 1a-band).
 *
 * MUAMMO: `couriers.vehicle_type` bitta maydon edi va uni faqat admin
 * o'zgartirardi. Aslida kuryerda bir nechta transport bo'lishi mumkin
 * (bugun o'z mashinasi, ertaga ijaradagi furgon). Lekin kuryer uni ERKIN
 * almashtira olsa:
 *   - yuk mashinasi kerak bo'lgan tovar yengil mashinaga tushadi;
 *   - guvohnoma toifasi mashinaga mos kelmaydi;
 *   - mijoz xaritada boshqa mashinani ko'radi.
 *
 * YECHIM: kuryer transport qo'shadi (`pending`), do'kon tasdiqlaydi
 * (`approved`), kuryer smena boshida tasdiqlanganlaridan birini TANLAYDI
 * (`active_vehicle_id`). Yo'lda mashina almashmaydi.
 */
@Injectable()
export class CourierVehiclesService {
  // ============================================================ kuryer uchun
  async list(courier: Courier) {
    const rows = await CourierVehicle.findAll({
      where: { courier_id: courier.id, status: { [Op.ne]: 'archived' } },
      order: [['id', 'ASC']],
    });
    return rows.map((v) => withCapacity(v, courier.active_vehicle_id));
  }

  async add(courier: Courier, dto: CourierVehicleDto, opts: { approved?: boolean; actor: Actor } = { actor: { type: 'courier', id: null } }) {
    const kind = resolveClass(dto);
    this.validatePlate({ ...dto, vehicle_type: kind.vehicle_type });
    try {
      const vehicle = await CourierVehicle.sequelize.transaction(async (t) => {
        const v = await CourierVehicle.create(
          {
            courier_id: courier.id,
            vehicle_type: kind.vehicle_type,
            vehicle_class: kind.vehicle_class,
            plate: dto.plate?.trim().toUpperCase() || null,
            model: dto.model?.trim() || null,
            color: dto.color?.trim() || null,
            capacity_kg: dto.capacity_kg ?? null,
            capacity_m3: dto.capacity_m3 ?? null,
            owner: dto.owner || 'own',
            // Admin o'zi qo'shsa — darhol `approved` (u allaqachon tekshirgan)
            status: opts.approved ? 'approved' : 'pending',
            verified_at: opts.approved ? new Date() : null,
            verified_by: opts.approved ? opts.actor.id : null,
          } as any,
          { transaction: t },
        );
        await this.event(v, null, v.status, opts.actor, null, t);
        return v;
      });

      if (!opts.approved && courier.store_id) {
        await pushToStoreAdmins([courier.store_id], {
          title: 'Yangi transport',
          body: `Kuryer ${courier.full_name} yangi transport qo'shdi — tasdiqlang`,
          data: { type: 'courier_vehicle_pending', courier_id: courier.id, vehicle_id: vehicle.id },
        });
      }
      return vehicle;
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        throw new ConflictException('Bu davlat raqami bilan transport allaqachon ro\'yxatda');
      }
      throw e;
    }
  }

  /** Tasdiqlangan transport O'ZGARMAYDI — kuryer yangisini qo'shadi. */
  async update(courier: Courier, id: number, dto: UpdateCourierVehicleDto) {
    const v = await this.owned(courier, id);
    if (!['pending', 'rejected'].includes(v.status)) {
      throw new ConflictException(
        "Tasdiqlangan transportni o'zgartirib bo'lmaydi — yangisini qo'shing",
      );
    }
    const payload: any = {};
    for (const k of ['model', 'color', 'capacity_kg', 'capacity_m3', 'owner'] as const) {
      if (dto[k] !== undefined) payload[k] = dto[k];
    }
    if (dto.vehicle_class !== undefined || dto.vehicle_type !== undefined) {
      // Faqat tur o'zgarsa eski sinf mos kelmay qolishi mumkin — sinf tashlanadi
      Object.assign(payload, resolveClass({ vehicle_class: dto.vehicle_class, vehicle_type: dto.vehicle_type ?? (dto.vehicle_class ? undefined : v.vehicle_type) }));
    }
    if (dto.plate !== undefined) payload.plate = dto.plate?.trim().toUpperCase() || null;
    this.validatePlate({ ...v.get({ plain: true }), ...payload } as any);
    // Rad etilgani tahrirlangach yana ko'rib chiqishga tushadi
    if (v.status === 'rejected') {
      payload.status = 'pending';
      payload.reject_reason = null;
    }
    await v.update(payload);
    return v;
  }

  /** O'chirish = arxiv. Faol transport bo'lsa 409. */
  async archive(courier: Courier, id: number, actor: Actor) {
    const v = await this.owned(courier, id);
    if (Number(courier.active_vehicle_id) === Number(v.id)) {
      throw new ConflictException("Faol transportni o'chirib bo'lmaydi — avval boshqasini tanlang");
    }
    await CourierVehicle.sequelize.transaction(async (t) => {
      const from = v.status;
      await v.update({ status: 'archived' }, { transaction: t });
      await this.event(v, from, 'archived', actor, null, t);
    });
    return { archived: true, id: v.id };
  }

  /**
   * Faol transportni tanlash. Qoidalar (1a-band):
   *   - faqat `approved`;
   *   - guvohnoma toifasi mos bo'lsin (`car` -> B, `van` -> B, `truck` -> C);
   *   - kuryerda faol yetkazish bo'lsa — yo'lda mashina almashmaydi (409).
   */
  async activate(courier: Courier, id: number, actor: Actor, t?: Transaction) {
    const v = await this.owned(courier, id, t);
    if (v.status !== 'approved') {
      throw new ConflictException(`Transport ${v.status} holatida — avval tasdiqlanishi kerak`);
    }
    const needed = LICENSE_FOR_VEHICLE[v.vehicle_type];
    if (needed && !(courier.license_categories || []).map((c) => c.toUpperCase()).includes(needed)) {
      throw new ConflictException(
        `Guvohnoma toifasi mos emas: ${v.vehicle_type} uchun "${needed}" toifasi kerak`,
      );
    }
    const active = await Delivery.count({
      where: { courier_id: courier.id, status: { [Op.in]: ACTIVE_STATUSES } },
      transaction: t,
    });
    if (active) {
      throw new ConflictException("Faol yetkazishingiz bor — yo'lda transport almashmaydi");
    }
    await courier.update(
      { active_vehicle_id: v.id, vehicle_type: v.vehicle_type } as any,
      { transaction: t },
    );
    return v;
  }

  // ============================================================ adminka uchun
  async listFor(courier: Courier) {
    const rows = await CourierVehicle.findAll({ where: { courier_id: courier.id }, order: [['id', 'ASC']] });
    return rows.map((v) => withCapacity(v, courier.active_vehicle_id));
  }

  /**
   * Tasdiqlash. №47: tekshiruvchi sinf va aniq sig'imni ham belgilashi mumkin —
   * tasdiqlangan transportda ham (eski `van`/`truck` yozuvlariga sinf berish uchun).
   * Turi boshqa sinfga o'tib qolmaydi (`van` damas yoki gazel bo'la oladi, fura emas).
   */
  async approve(courier: Courier, id: number, r: StoreRequester, dto: ApproveVehicleDto = {}) {
    const v = await this.owned(courier, id);
    if (v.status === 'archived') throw new ConflictException('Arxivdagi transportni tasdiqlab bo\'lmaydi');
    const spec: any = {};
    if (dto.vehicle_class !== undefined) {
      const kind = resolveClass({ vehicle_class: dto.vehicle_class });
      if (kind.vehicle_type !== v.vehicle_type) {
        throw new BadRequestException(`${v.vehicle_type} transportiga ${dto.vehicle_class} sinfi berilmaydi — kuryer yangi transport qo'shsin`);
      }
      spec.vehicle_class = kind.vehicle_class;
    }
    if (dto.capacity_kg !== undefined) spec.capacity_kg = dto.capacity_kg || null;
    if (dto.capacity_m3 !== undefined) spec.capacity_m3 = dto.capacity_m3 || null;
    if (v.status === 'approved' && !Object.keys(spec).length) return v;
    await CourierVehicle.sequelize.transaction(async (t) => {
      const from = v.status;
      const changes = Object.entries(spec).map(([k, x]) => `${k}=${x ?? 'null'}`).join(', ');
      await v.update(
        v.status === 'approved'
          ? spec
          : { ...spec, status: 'approved', reject_reason: null, verified_at: new Date(), verified_by: r?.user_id ?? null },
        { transaction: t },
      );
      await this.event(v, from, 'approved', this.actorOf(r), changes || null, t);
    });
    return v;
  }

  async reject(courier: Courier, id: number, reason: string, r: StoreRequester) {
    const v = await this.owned(courier, id);
    if (v.status === 'archived') throw new ConflictException('Arxivdagi transport');
    if (Number(courier.active_vehicle_id) === Number(v.id)) {
      // Rad etilgan transport faol bo'lib qolmasin
      await courier.update({ active_vehicle_id: null } as any);
    }
    await CourierVehicle.sequelize.transaction(async (t) => {
      const from = v.status;
      await v.update(
        { status: 'rejected', reject_reason: reason, verified_at: new Date(), verified_by: r?.user_id ?? null },
        { transaction: t },
      );
      await this.event(v, from, 'rejected', this.actorOf(r), reason, t);
    });
    return v;
  }

  async events(courier: Courier, id: number) {
    const v = await this.owned(courier, id);
    return CourierVehicleEvent.findAll({ where: { vehicle_id: v.id }, order: [['id', 'ASC']] });
  }

  /** Kuryerning faol transporti (biriktirishda kerak). */
  async activeVehicle(courier: Courier): Promise<CourierVehicle | null> {
    if (!courier.active_vehicle_id) return null;
    return CourierVehicle.findByPk(courier.active_vehicle_id);
  }

  // ============================================================ ichki
  private async owned(courier: Courier, id: number, t?: Transaction) {
    const v = await CourierVehicle.findOne({ where: { id, courier_id: courier.id }, transaction: t });
    if (!v) throw new NotFoundException('Transport topilmadi');
    return v;
  }

  private validatePlate(dto: { vehicle_type: string; plate?: string | null }) {
    const needsPlate = ['car', 'van', 'truck'].includes(dto.vehicle_type);
    if (needsPlate && !dto.plate?.trim()) {
      throw new BadRequestException(`${dto.vehicle_type} uchun davlat raqami (plate) majburiy`);
    }
  }

  private actorOf(r: StoreRequester): Actor {
    return { type: r?.role === 'superadmin' ? 'superadmin' : 'store', id: r?.user_id ?? null };
  }

  private event(
    v: CourierVehicle,
    from: string | null,
    to: string,
    actor: Actor,
    comment: string | null,
    t?: Transaction,
  ) {
    return CourierVehicleEvent.create(
      {
        vehicle_id: v.id,
        courier_id: v.courier_id,
        from_status: from,
        to_status: to,
        actor_type: actor.type,
        actor_id: actor.id,
        comment: comment ? String(comment).slice(0, 500) : null,
        created_at: new Date(),
      } as any,
      { transaction: t },
    );
  }
}

interface Actor {
  type: 'superadmin' | 'store' | 'courier' | 'system';
  id: number | null;
}
