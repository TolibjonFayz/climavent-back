import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import * as bcrypt from 'bcrypt';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { dropDeviceTokens } from 'src/deliveries/store-push';
import { revokeAllRefreshTokens } from 'src/store_auth/mobile-session';
import { PasswordSetupService } from 'src/store_auth/password-setup.service';
import { expandPermissions, normalizePermissions } from 'src/store_auth/staff-permissions';
import { StoreRequester } from 'src/store_auth/store_auth.guard';
import { StoreUser } from 'src/store_users/model/store_user.model';
import { CreateStaffDto, CreateStoreRoleDto, UpdateStaffDto, UpdateStoreRoleDto } from './dto';

const SALT_ROUNDS = 10;

/**
 * Do'kon xodimlari va rollar (topshiriq №35).
 *
 * Kim ishlatadi: do'kon admini (cheklovsiz), `staff.*` ruxsatli xodim
 * (huquqini oshira olmaydi — 6-band), superadmin (`store_id` bilan).
 * Endpointga kirish ruxsatini `StaffPermissionGuard` tekshiradi; bu yerda —
 * do'kon doirasi va HUQUQ OSHIRISHGA qarshi qoidalar.
 */
@Injectable()
export class StoreStaffService {
  private readonly logger = new Logger('StoreStaff');

  constructor(
    @InjectConnection() private readonly db: Sequelize,
    private readonly passwordSetup: PasswordSetupService,
  ) {}

  // ============================================================ rollar
  async listRoles(r: StoreRequester, storeId?: number) {
    const store = this.storeOf(r, storeId);
    const rows: any[] = await this.db.query(
      `SELECT r.id, r.store_id, r.name, r.permissions, r.created_at, r.updated_at,
              (SELECT COUNT(*)::int FROM store_users su WHERE su.store_role_id = r.id) AS staff_count
         FROM store_roles r WHERE r.store_id = :store ORDER BY r.id`,
      { replacements: { store }, type: QueryTypes.SELECT },
    );
    return rows.map(roleView);
  }

  async createRole(r: StoreRequester, dto: CreateStoreRoleDto) {
    const store = this.storeOf(r, dto.store_id);
    const name = this.cleanName(dto.name);
    const permissions = normalizePermissions(dto.permissions);
    this.assertSubset(r, permissions);
    await this.assertNameFree(store, name);
    const [row]: any[] = await this.db.query(
      `INSERT INTO store_roles (store_id, name, permissions) VALUES (:store, :name, ARRAY[:perms]::text[])
       RETURNING id`,
      { replacements: { store, name, perms: permissions }, type: QueryTypes.SELECT },
    );
    await this.audit(r, store, 'staff_role_created', `rol #${row.id} «${name}»: ${permissions.join(', ')}`);
    return this.roleById(store, row.id);
  }

  async updateRole(r: StoreRequester, id: number, dto: UpdateStoreRoleDto, storeId?: number) {
    const store = this.storeOf(r, storeId);
    const role = await this.roleById(store, id);
    this.assertSubset(r, role.permissions);

    const name = dto.name !== undefined ? this.cleanName(dto.name) : role.name;
    if (name.toLowerCase() !== role.name.toLowerCase()) await this.assertNameFree(store, name, id);
    const permissions = dto.permissions !== undefined ? normalizePermissions(dto.permissions) : role.permissions;
    this.assertSubset(r, permissions);
    const changed = permissions.join(',') !== role.permissions.join(',');

    await this.db.transaction(async (t) => {
      await this.db.query(
        `UPDATE store_roles SET name = :name, permissions = ARRAY[:perms]::text[], updated_at = now() WHERE id = :id`,
        { replacements: { id, name, perms: permissions }, transaction: t },
      );
      // Ruxsatlar o'zgardi — shu roldagi xodimlar chiqarib yuboriladi va qayta
      // kirganda yangi ruxsatlarni oladi (adminka ruxsatlarni sessiyada saqlaydi).
      if (changed) {
        await this.db.query(
          `UPDATE store_users SET token_version = token_version + 1 WHERE store_role_id = :id`,
          { replacements: { id }, transaction: t },
        );
      }
    });
    if (changed) {
      const users: any[] = await this.db.query('SELECT id FROM store_users WHERE store_role_id = :id', {
        replacements: { id },
        type: QueryTypes.SELECT,
      });
      for (const u of users) await revokeAllRefreshTokens(Number(u.id));
    }
    await this.audit(
      r,
      store,
      'staff_role_updated',
      `rol #${id}: ` +
        [name !== role.name ? `nom «${role.name}» → «${name}»` : '', changed ? `ruxsatlar ${role.permissions.join(', ')} → ${permissions.join(', ')}` : '']
          .filter(Boolean)
          .join('; '),
    );
    return this.roleById(store, id);
  }

  async deleteRole(r: StoreRequester, id: number, storeId?: number) {
    const store = this.storeOf(r, storeId);
    const role = await this.roleById(store, id);
    this.assertSubset(r, role.permissions);
    if (role.staff_count > 0) {
      throw new ConflictException(`Bu rolda ${role.staff_count} ta xodim bor — avval ularga boshqa rol bering`);
    }
    await this.db.query('DELETE FROM store_roles WHERE id = :id', { replacements: { id } });
    await this.audit(r, store, 'staff_role_deleted', `rol #${id} «${role.name}»`);
    return { message: "Rol o'chirildi", id };
  }

  // ============================================================ xodimlar
  async listStaff(r: StoreRequester, storeId?: number) {
    const store = this.storeOf(r, storeId);
    const rows: any[] = await this.db.query(`${STAFF_SQL} WHERE su.store_id = :store AND su.role = 'store_staff' ORDER BY su.id`, {
      replacements: { store },
      type: QueryTypes.SELECT,
    });
    return rows.map(staffView);
  }

  async createStaff(r: StoreRequester, dto: CreateStaffDto) {
    const store = this.storeOf(r, dto.store_id);
    const role = await this.roleForAssign(store, dto.role_id);
    this.assertSubset(r, role.permissions);
    const login = dto.login.trim();
    const taken = await StoreUser.findOne({ where: { login }, attributes: ['id'] });
    if (taken) throw new ConflictException(`'${login}' logini allaqachon band`);

    const created = await StoreUser.create({
      login,
      password_hash: await bcrypt.hash(dto.password, SALT_ROUNDS),
      full_name: dto.full_name.trim(),
      phone: dto.phone ?? null,
      role: 'store_staff',
      store_id: store,
      store_role_id: role.id,
      is_active: true,
    } as any);
    await this.audit(r, store, 'staff_created', `xodim #${created.id} ${login}, rol «${role.name}»`);
    return { user: await this.staffById(store, created.id) };
  }

  async updateStaff(r: StoreRequester, id: number, dto: UpdateStaffDto, storeId?: number) {
    const store = this.storeOf(r, storeId);
    const target = await this.staffById(store, id);
    const self = r.user_id === id;
    if (self && (dto.role_id !== undefined || dto.is_active !== undefined || dto.password !== undefined)) {
      throw new ForbiddenException(
        "O'z hisobingizning roli, holati va parolini bu yerda o'zgartira olmaysiz (parol — /store-auth/change-password)",
      );
    }
    if (!self) await this.assertCanManage(r, target);

    const set: Record<string, unknown> = {};
    const notes: string[] = [];
    let bump = false;
    let dropDevices = false;
    if (dto.full_name !== undefined) set.full_name = dto.full_name.trim();
    if (dto.phone !== undefined) set.phone = dto.phone;
    if (dto.role_id !== undefined && dto.role_id !== target.role_id) {
      const role = await this.roleForAssign(store, dto.role_id);
      this.assertSubset(r, role.permissions);
      set.store_role_id = role.id;
      bump = true;
      notes.push(`rol → «${role.name}»`);
    }
    if (dto.is_active !== undefined && dto.is_active !== target.is_active) {
      set.is_active = dto.is_active;
      if (!dto.is_active) {
        bump = true;
        dropDevices = true;
      }
      notes.push(dto.is_active ? 'faollashtirildi' : 'nofaol qilindi');
    }
    if (dto.password !== undefined) {
      set.password_hash = await bcrypt.hash(dto.password, SALT_ROUNDS);
      bump = true;
      dropDevices = true;
      notes.push('parol almashtirildi');
    }
    if (bump) set.token_version = Sequelize.literal('token_version + 1');
    if (Object.keys(set).length) await StoreUser.update(set as any, { where: { id } });
    if (bump) await revokeAllRefreshTokens(id);
    if (dropDevices) await dropDeviceTokens('store_user', id);
    if (notes.length) await this.audit(r, store, 'staff_updated', `xodim #${id} ${target.login}: ${notes.join('; ')}`);
    return { user: await this.staffById(store, id) };
  }

  async deleteStaff(r: StoreRequester, id: number, storeId?: number) {
    const store = this.storeOf(r, storeId);
    const target = await this.staffById(store, id);
    if (r.user_id === id) throw new ForbiddenException("O'z hisobingizni o'chira olmaysiz");
    await this.assertCanManage(r, target);
    // Haqiqiy o'chirish: kirish jurnali (№21) `store_user_id` ni NULL qilib
    // `login` bilan saqlanib qoladi; refresh tokenlar CASCADE.
    await StoreUser.destroy({ where: { id } });
    await dropDeviceTokens('store_user', id);
    await this.audit(r, store, 'staff_deleted', `xodim #${id} ${target.login}`);
    return { message: "Xodim o'chirildi", id };
  }

  async passwordSetupToken(r: StoreRequester, id: number, storeId?: number) {
    const store = this.storeOf(r, storeId);
    const target = await this.staffById(store, id);
    if (r.user_id === id) throw new ForbiddenException("O'z parolingiz — /store-auth/change-password");
    await this.assertCanManage(r, target);
    return this.passwordSetup.issue(id);
  }

  // ============================================================ ichki
  /** Do'kon — tokendan; superadmin uchun `?store_id=` / tanada. */
  private storeOf(r: StoreRequester, storeId?: number): number {
    if (r.role === 'superadmin') {
      if (!storeId) throw new BadRequestException('Superadmin uchun store_id kerak');
      return Number(storeId);
    }
    if (r.role !== 'store_admin' || !r.store_id) throw new ForbiddenException("Ruxsat yo'q");
    return Number(r.store_id);
  }

  /**
   * HUQUQNI OSHIRIB BO'LMAYDI (6-band): xodim o'zida yo'q ruxsatli rolni
   * yarata/tahrirlay/o'chira/bera olmaydi. Do'kon admini va superadmin — cheklovsiz.
   */
  private assertSubset(r: StoreRequester, permissions: readonly string[]) {
    if (!r.staff) return;
    const mine = new Set(r.staff.permissions);
    const extra = permissions.filter((p) => !mine.has(p));
    if (extra.length) {
      throw new ForbiddenException({
        statusCode: 403,
        message: "O'zingizda yo'q ruxsatni bera olmaysiz",
        required: extra[0],
        missing: extra,
      });
    }
  }

  /**
   * Xodim o'zidan KATTA huquqli xodimga tegolmaydi: aks holda uning parolini
   * almashtirib (yoki havola olib) o'sha hisob bilan kirardi.
   */
  private async assertCanManage(r: StoreRequester, target: { role_id: number | null }) {
    if (!r.staff) return;
    if (!target.role_id) return;
    const [role]: any[] = await this.db.query('SELECT permissions FROM store_roles WHERE id = :id', {
      replacements: { id: target.role_id },
      type: QueryTypes.SELECT,
    });
    this.assertSubset(r, expandPermissions(role?.permissions));
  }

  private cleanName(v: string) {
    const name = String(v ?? '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 60) throw new BadRequestException('name 2–60 belgi');
    return name;
  }

  private async assertNameFree(store: number, name: string, exceptId?: number) {
    const [row]: any[] = await this.db.query(
      `SELECT id FROM store_roles WHERE store_id = :store AND lower(btrim(name)) = lower(:name)
         ${exceptId ? 'AND id <> :except' : ''}`,
      { replacements: { store, name, except: exceptId ?? 0 }, type: QueryTypes.SELECT },
    );
    if (row) throw new ConflictException(`«${name}» nomli rol bor`);
  }

  private async roleById(store: number, id: number) {
    const [row]: any[] = await this.db.query(
      `SELECT r.id, r.store_id, r.name, r.permissions, r.created_at, r.updated_at,
              (SELECT COUNT(*)::int FROM store_users su WHERE su.store_role_id = r.id) AS staff_count
         FROM store_roles r WHERE r.id = :id AND r.store_id = :store`,
      { replacements: { id, store }, type: QueryTypes.SELECT },
    );
    if (!row) throw new NotFoundException('Rol topilmadi');
    return roleView(row);
  }

  /** Xodimga beriladigan rol — shu do'konniki bo'lishi shart, aks holda 400. */
  private async roleForAssign(store: number, id: number) {
    try {
      return await this.roleById(store, id);
    } catch {
      throw new BadRequestException("role_id shu do'konning roli emas");
    }
  }

  /** Faqat shu do'konning `store_staff` hisobi; admin va kuryer bu yerdan ko'rinmaydi — 404. */
  private async staffById(store: number, id: number) {
    const [row]: any[] = await this.db.query(
      `${STAFF_SQL} WHERE su.id = :id AND su.store_id = :store AND su.role = 'store_staff'`,
      { replacements: { id, store }, type: QueryTypes.SELECT },
    );
    if (!row) throw new NotFoundException('Xodim topilmadi');
    return staffView(row);
  }

  /** Jurnal (7-band) — `store_events`. Yozilmasa asosiy amal buzilmaydi. */
  private async audit(r: StoreRequester, store: number, type: string, message: string) {
    try {
      await this.db.query(
        `INSERT INTO store_events (store_id, type, actor_id, actor_login, message, created_at)
         VALUES (:store, :type, :actor, :login, :message, now())`,
        {
          replacements: {
            store,
            type,
            actor: r.user_id ?? null,
            login: r.login ?? (r.role === 'superadmin' ? 'superadmin' : null),
            message: message.slice(0, 2000),
          },
        },
      );
    } catch (e) {
      this.logger.warn(`Jurnalga yozilmadi (${type}): ${(e as Error).message}`);
    }
  }
}

const STAFF_SQL = `
  SELECT su.id, su.login, su.full_name, su.phone, su.store_id, su.store_role_id AS role_id,
         r.name AS role_name, su.is_active, su.last_login_at, su."createdAt" AS created_at
    FROM store_users su LEFT JOIN store_roles r ON r.id = su.store_role_id`;

function roleView(r: any) {
  return {
    id: Number(r.id),
    store_id: Number(r.store_id),
    name: String(r.name),
    permissions: expandPermissions(r.permissions),
    staff_count: Number(r.staff_count ?? 0),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function staffView(r: any) {
  return {
    id: Number(r.id),
    login: r.login,
    full_name: r.full_name ?? null,
    phone: r.phone ?? null,
    store_id: Number(r.store_id),
    role_id: r.role_id === null ? null : Number(r.role_id),
    role_name: r.role_name ?? null,
    is_active: !!r.is_active,
    last_login_at: r.last_login_at ?? null,
    created_at: r.created_at ?? null,
  };
}
