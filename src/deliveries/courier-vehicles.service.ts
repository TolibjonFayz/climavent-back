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
import { CourierVehicleDto, UpdateCourierVehicleDto } from './dto/dto';
import { pushToStoreAdmins } from './push';

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
    return rows.map((v) => ({
      ...v.get({ plain: true }),
      is_active: Number(courier.active_vehicle_id) === Number(v.id),
    }));
  }

  async add(courier: Courier, dto: CourierVehicleDto, opts: { approved?: boolean; actor: Actor } = { actor: { type: 'courier', id: null } }) {
    this.validatePlate(dto);
    try {
      const vehicle = await CourierVehicle.sequelize.transaction(async (t) => {
        const v = await CourierVehicle.create(
          {
            courier_id: courier.id,
            vehicle_type: dto.vehicle_type,
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
    for (const k of ['vehicle_type', 'model', 'color', 'capacity_kg', 'capacity_m3', 'owner'] as const) {
      if (dto[k] !== undefined) payload[k] = dto[k];
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
    return rows.map((v) => ({
      ...v.get({ plain: true }),
      is_active: Number(courier.active_vehicle_id) === Number(v.id),
    }));
  }

  async approve(courier: Courier, id: number, r: StoreRequester) {
    const v = await this.owned(courier, id);
    if (v.status === 'approved') return v;
    if (v.status === 'archived') throw new ConflictException('Arxivdagi transportni tasdiqlab bo\'lmaydi');
    await CourierVehicle.sequelize.transaction(async (t) => {
      const from = v.status;
      await v.update(
        { status: 'approved', reject_reason: null, verified_at: new Date(), verified_by: r?.user_id ?? null },
        { transaction: t },
      );
      await this.event(v, from, 'approved', this.actorOf(r), null, t);
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
