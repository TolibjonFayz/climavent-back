import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Op, QueryTypes, Transaction } from 'sequelize';
import type { StoreRequester } from 'src/store_auth/store_auth.guard';
import { Courier } from 'src/deliveries/model/models';
import { recordCourierEvent } from 'src/deliveries/courier-events';
import { isDistrict, isRegion } from 'src/regions/regions.data';
import {
  CREW_INVITE_TTL_MS,
  CREW_INVITE_URL_BASE,
  Crew,
  CrewInvite,
  CrewMember,
  ServiceJobWorker,
  shortName,
  TRUST_RANK,
} from './models';
import { refreshCourierTrust, refreshCrewTrust } from './trust';

export const hashInviteToken = (raw: string) => createHash('sha256').update(`crew-invite:${raw}`).digest('hex');

/** Faol a'zolik (bitta usta — bitta faol brigada). */
export async function activeMembership(courierId: number, t?: Transaction) {
  return CrewMember.findOne({ where: { courier_id: courierId, left_at: null }, transaction: t });
}

/**
 * Brigada arizasi tasdiqlanganda (1.2): brigada + boshliq a'zoligi. Ariza
 * tranzaksiyasi ICHIDA chaqiriladi — biror qadam yiqilsa hammasi qaytadi.
 */
export async function createCrewForLeader(
  input: { name: string; members_count: number; skills: string[]; service_areas: any[]; store_id: number | null; leader: Courier },
  t: Transaction,
) {
  const crew = await Crew.create(
    {
      name: input.name.trim(),
      leader_courier_id: input.leader.id,
      store_id: input.store_id,
      skills: input.skills,
      service_areas: input.service_areas || [],
      members_count: Math.max(1, Math.min(50, Number(input.members_count) || 1)),
      trust_level: input.leader.documents_verified_at ? 'documents' : 'none',
    } as any,
    { transaction: t },
  );
  await CrewMember.create({ crew_id: crew.id, courier_id: input.leader.id, role: 'leader', joined_at: new Date() } as any, { transaction: t });
  return crew;
}

/** Taklif bilan kelgan a'zo tasdiqlanganda (1.3) — avtomatik a'zo. */
export async function joinCrewByInvite(inviteId: number, courier: Courier, t: Transaction) {
  const invite = await CrewInvite.findByPk(inviteId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!invite || invite.revoked_at) throw new ConflictException('Brigada taklifi bekor qilingan');
  const crew = await Crew.findByPk(invite.crew_id, { transaction: t });
  if (!crew || !crew.is_active) throw new ConflictException('Brigada faol emas');
  await CrewMember.create({ crew_id: crew.id, courier_id: courier.id, role: 'member', joined_at: new Date() } as any, { transaction: t });
  await invite.update({ accepted_at: new Date() } as any, { transaction: t });
  await recordCourierEvent(courier.id, 'crew_joined', null, `Brigada #${crew.id} (${crew.name})`, t);
  return crew;
}

@Injectable()
export class CrewsService {
  private isSuper = (r: StoreRequester) => r?.role === 'superadmin';

  // ============================================================ usta ilovasi
  async workerCrew(w: Courier) {
    const m = await activeMembership(w.id);
    if (!m) throw new NotFoundException("Siz brigadada emassiz");
    const crew = await Crew.findByPk(m.crew_id);
    if (!crew) throw new NotFoundException("Siz brigadada emassiz");
    const leader = crew.leader_courier_id === w.id;
    const members: any[] = await Crew.sequelize.query(
      `SELECT m.courier_id, m.role, m.joined_at, c.full_name, c.phone, c.skills, c.is_active, c.is_online,
              c.trust_level, c.rating, c.jobs_done, (c.documents_verified_at IS NOT NULL) AS documents_ok
         FROM crew_members m JOIN couriers c ON c.id = m.courier_id
        WHERE m.crew_id = :id AND m.left_at IS NULL
        ORDER BY (m.role = 'leader') DESC, m.joined_at`,
      { replacements: { id: crew.id }, type: QueryTypes.SELECT },
    );
    const invites = leader
      ? await CrewInvite.findAll({
          where: { crew_id: crew.id, accepted_at: null, revoked_at: null, expires_at: { [Op.gt]: new Date() } },
          attributes: ['id', 'full_name', 'phone', 'expires_at', 'application_id', 'created_at'],
          order: [['id', 'DESC']],
        })
      : [];
    return {
      ...this.crewView(crew),
      my_role: leader ? 'leader' : 'member',
      members: members.map((x) => ({
        courier_id: Number(x.courier_id),
        role: x.role,
        full_name: leader || Number(x.courier_id) === w.id ? x.full_name : shortName(x.full_name),
        // Telefon — faqat boshliqqa (a'zolar bir-birining raqamini brigada chatida biladi)
        phone: leader ? x.phone : null,
        skills: x.skills,
        is_active: x.is_active,
        is_online: x.is_online,
        documents_ok: x.documents_ok,
        trust_level: x.trust_level,
        rating: x.rating === null ? null : Number(x.rating),
        jobs_done: Number(x.jobs_done || 0),
        joined_at: x.joined_at,
      })),
      invites,
    };
  }

  /** Taklif (1.3): havola boshliqdan Telegram orqali ketadi — SMS YO'Q. */
  async createInvite(w: Courier, dto: { full_name: string; phone: string }) {
    const crew = await this.leaderCrew(w);
    const phone = dto.phone.trim();
    await this.ensurePhoneFree(phone);
    const dup = await CrewInvite.findOne({
      where: { phone, accepted_at: null, revoked_at: null, expires_at: { [Op.gt]: new Date() } },
      attributes: ['id', 'crew_id'],
    });
    if (dup) throw new ConflictException('Bu raqamga faol taklif allaqachon yuborilgan');
    const raw = randomBytes(24).toString('hex');
    const invite = await CrewInvite.create({
      crew_id: crew.id,
      token_hash: hashInviteToken(raw),
      full_name: dto.full_name.trim(),
      phone,
      created_by: w.id,
      expires_at: new Date(Date.now() + CREW_INVITE_TTL_MS),
    } as any);
    return { id: invite.id, invite_token: raw, url: `${CREW_INVITE_URL_BASE}${raw}`, expires_at: invite.expires_at };
  }

  async revokeInvite(w: Courier, inviteId: number) {
    const crew = await this.leaderCrew(w);
    const inv = await CrewInvite.findOne({ where: { id: inviteId, crew_id: crew.id } });
    if (!inv) throw new NotFoundException('Taklif topilmadi');
    if (inv.accepted_at) throw new ConflictException('Taklif allaqachon qabul qilingan');
    await inv.update({ revoked_at: new Date() } as any);
    return { id: inv.id, revoked: true };
  }

  async removeMember(w: Courier, courierId: number) {
    const crew = await this.leaderCrew(w);
    if (courierId === w.id) throw new BadRequestException("Boshliq o'zini brigadadan chiqara olmaydi");
    await Crew.sequelize.transaction(async (t) => {
      const m = await CrewMember.findOne({ where: { crew_id: crew.id, courier_id: courierId, left_at: null }, transaction: t, lock: t.LOCK.UPDATE });
      if (!m) throw new NotFoundException("A'zo topilmadi");
      await m.update({ left_at: new Date() } as any, { transaction: t });
      // Faol ishlardan ham olinadi (ijrochi sifatida)
      await Crew.sequelize.query(
        `DELETE FROM service_job_workers w USING service_jobs j
          WHERE w.job_id = j.id AND w.courier_id = :c AND j.crew_id = :crew
            AND j.status IN ('assigned', 'accepted', 'on_the_way', 'arrived', 'in_progress')`,
        { replacements: { c: courierId, crew: crew.id }, transaction: t },
      );
      await recordCourierEvent(courierId, 'crew_left', { role: 'courier', user_id: w.store_user_id, login: null }, `Brigada #${crew.id}: boshliq chiqardi`, t);
    });
    await refreshCrewTrust([crew.id]);
    return { crew_id: crew.id, courier_id: courierId, removed: true };
  }

  // ============================================================ ommaviy taklif
  async publicInvite(token: string) {
    const inv = await this.inviteByToken(token);
    const crew = await Crew.findByPk(inv.crew_id);
    const leader = crew ? await Courier.findByPk(crew.leader_courier_id, { attributes: ['full_name'] }) : null;
    const status = inv.revoked_at
      ? 'revoked'
      : inv.accepted_at
        ? 'accepted'
        : inv.application_id
          ? 'applied'
          : new Date(inv.expires_at).getTime() < Date.now()
            ? 'expired'
            : 'active';
    return {
      status,
      full_name: inv.full_name,
      expires_at: inv.expires_at,
      crew: crew ? { name: crew.name, members_count: crew.members_count, skills: crew.skills, is_active: crew.is_active } : null,
      leader: leader ? shortName(leader.full_name) : null,
    };
  }

  /** Ariza topshirish uchun: yaroqli (muddati o'tmagan, ishlatilmagan) taklif. */
  async usableInvite(token: string) {
    const inv = await this.inviteByToken(token);
    if (inv.revoked_at) throw new GoneException('Taklif bekor qilingan');
    if (inv.accepted_at || inv.application_id) throw new ConflictException('Bu taklif bilan ariza allaqachon topshirilgan');
    if (new Date(inv.expires_at).getTime() < Date.now()) throw new GoneException("Taklif muddati o'tgan — boshliqdan yangisini so'rang");
    const crew = await Crew.findByPk(inv.crew_id);
    if (!crew || !crew.is_active) throw new ConflictException('Brigada faol emas');
    return { invite: inv, crew };
  }

  // ============================================================ orqa ofis
  async list(r: StoreRequester, q: { store_id?: string; skill?: string; is_active?: string }) {
    const where: any = {};
    if (!this.isSuper(r)) where.store_id = r.store_id;
    else if (q.store_id === 'null') where.store_id = null;
    else if (q.store_id && /^\d+$/.test(q.store_id)) where.store_id = Number(q.store_id);
    if (q.skill) where.skills = { [Op.contains]: [String(q.skill)] };
    if (q.is_active === 'true' || q.is_active === 'false') where.is_active = q.is_active === 'true';
    const rows = await Crew.findAll({ where, order: [['is_active', 'DESC'], ['id', 'ASC']] });
    const out = await Promise.all(rows.map((c) => this.backofficeView(c)));
    // `top` ro'yxat boshida (2-band)
    return out.sort((a, b) => (TRUST_RANK[b.trust_level] ?? 0) - (TRUST_RANK[a.trust_level] ?? 0) || Number(b.is_active) - Number(a.is_active));
  }

  async getOne(id: number, r: StoreRequester) {
    return this.backofficeView(await this.scoped(id, r), true);
  }

  async update(id: number, dto: { name?: string; is_active?: boolean; skills?: string[]; members_count?: number; service_areas?: any[] }, r: StoreRequester) {
    const crew = await this.scoped(id, r);
    const payload: any = {};
    if (dto.name !== undefined) payload.name = dto.name.trim();
    if (dto.is_active !== undefined) payload.is_active = dto.is_active;
    if (dto.members_count !== undefined) payload.members_count = dto.members_count;
    if (dto.skills !== undefined) payload.skills = await normalizeSkills(dto.skills);
    if (dto.service_areas !== undefined) payload.service_areas = normalizeAreas(dto.service_areas);
    if (!Object.keys(payload).length) return this.backofficeView(crew, true);
    await crew.update(payload);
    return this.backofficeView(crew, true);
  }

  // ============================================================ ishonch (superadmin)
  async verifyCourierSkills(id: number, dto: { categories: string[]; note?: string; replace?: boolean }, actor: StoreRequester) {
    const c = await Courier.findByPk(id);
    if (!c) throw new NotFoundException('Usta topilmadi');
    const cats = await normalizeSkills(dto.categories, false);
    const next = dto.replace ? cats : [...new Set([...(c.verified_skills || []), ...cats])];
    await c.update({ verified_skills: next } as any);
    await recordCourierEvent(id, 'skills_verified', actorOf(actor), `${next.join(', ') || "bo'sh"}${dto.note ? ` — ${dto.note}` : ''}`);
    await refreshCourierTrust([id], { actor: actorOf(actor), reason: 'malaka tasdiqlandi' });
    await c.reload();
    return trustAdminView(c);
  }

  async verifyCrewSkills(id: number, dto: { categories: string[]; note?: string; replace?: boolean }, actor: StoreRequester) {
    const crew = await Crew.findByPk(id);
    if (!crew) throw new NotFoundException('Brigada topilmadi');
    const cats = await normalizeSkills(dto.categories, false);
    const next = dto.replace ? cats : [...new Set([...(crew.verified_skills || []), ...cats])];
    await crew.update({ verified_skills: next } as any);
    await recordCourierEvent(crew.leader_courier_id, 'skills_verified', actorOf(actor), `Brigada #${id}: ${next.join(', ') || "bo'sh"}${dto.note ? ` — ${dto.note}` : ''}`);
    await refreshCrewTrust([id], { actor: actorOf(actor), reason: 'malaka tasdiqlandi' });
    await crew.reload();
    return this.backofficeView(crew, true);
  }

  /** `top` ni olib qo'yish (`allowed: false`) yoki qaytarish — fon ishi shartlarni baribir tekshiradi. */
  async setCourierTop(id: number, allowed: boolean, reason: string | undefined, actor: StoreRequester) {
    const c = await Courier.findByPk(id);
    if (!c) throw new NotFoundException('Usta topilmadi');
    await c.update({ top_revoked_at: allowed ? null : new Date() } as any);
    await refreshCourierTrust([id], { actor: actorOf(actor), reason: reason || (allowed ? "`top` qaytarildi" : "`top` olib qo'yildi") });
    await c.reload();
    return trustAdminView(c);
  }

  async setCrewTop(id: number, allowed: boolean, reason: string | undefined, actor: StoreRequester) {
    const crew = await Crew.findByPk(id);
    if (!crew) throw new NotFoundException('Brigada topilmadi');
    await crew.update({ top_revoked_at: allowed ? null : new Date() } as any);
    await refreshCrewTrust([id], { actor: actorOf(actor), reason: reason || (allowed ? "`top` qaytarildi" : "`top` olib qo'yildi") });
    await crew.reload();
    return this.backofficeView(crew, true);
  }

  // ============================================================ yordamchilar
  private async leaderCrew(w: Courier) {
    const crew = await Crew.findOne({ where: { leader_courier_id: w.id, is_active: true } });
    if (!crew) throw new ForbiddenException('Bu amal faqat brigada boshlig\'i uchun');
    return crew;
  }

  private async scoped(id: number, r: StoreRequester) {
    const crew = await Crew.findByPk(id);
    if (!crew || (!this.isSuper(r) && Number(crew.store_id) !== Number(r.store_id))) throw new NotFoundException('Brigada topilmadi');
    return crew;
  }

  private async inviteByToken(token: string) {
    if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) throw new NotFoundException('Taklif topilmadi');
    const inv = await CrewInvite.findOne({ where: { token_hash: hashInviteToken(token) } });
    if (!inv) throw new NotFoundException('Taklif topilmadi');
    return inv;
  }

  private async ensurePhoneFree(phone: string) {
    const digits = phone.replace(/\D/g, '');
    const [row]: any[] = await Crew.sequelize.query(
      `SELECT (SELECT COUNT(*) FROM store_users WHERE login IN (:d, :c) OR phone = :p)::int
            + (SELECT COUNT(*) FROM couriers WHERE phone = :p)::int
            + (SELECT COUNT(*) FROM courier_applications WHERE phone = :p AND status IN ('pending', 'needs_info', 'approved'))::int AS n`,
      { replacements: { d: digits, c: `c${digits}`, p: phone }, type: QueryTypes.SELECT },
    );
    if (Number(row?.n) > 0) throw new ConflictException("Bu raqam bilan hisob yoki ariza bor");
  }

  crewView(c: Crew) {
    return {
      id: c.id,
      name: c.name,
      store_id: c.store_id,
      leader_courier_id: c.leader_courier_id,
      skills: c.skills,
      service_areas: c.service_areas,
      members_count: c.members_count,
      is_active: c.is_active,
      trust_level: c.trust_level,
      verified_skills: c.verified_skills,
      rating: c.rating,
      reviews_count: c.reviews_count,
      jobs_done: c.jobs_done,
    };
  }

  private async backofficeView(c: Crew, full = false) {
    const members: any[] = await Crew.sequelize.query(
      `SELECT m.courier_id, m.role, m.joined_at, c.full_name, c.phone, c.is_active, c.trust_level,
              (c.documents_verified_at IS NOT NULL) AS documents_ok
         FROM crew_members m JOIN couriers c ON c.id = m.courier_id
        WHERE m.crew_id = :id AND m.left_at IS NULL ORDER BY (m.role = 'leader') DESC, m.joined_at`,
      { replacements: { id: c.id }, type: QueryTypes.SELECT },
    );
    return {
      ...this.crewView(c),
      top_revoked_at: c.top_revoked_at,
      active_members: members.length,
      members: members.map((m) => ({ ...m, courier_id: Number(m.courier_id) })),
      ...(full ? { created_at: c.created_at, updated_at: c.updated_at } : {}),
    };
  }
}

const actorOf = (r: StoreRequester) => ({ role: r?.role, user_id: r?.user_id ?? null, login: r?.login ?? null });

function trustAdminView(c: Courier) {
  return {
    id: c.id,
    trust_level: c.trust_level,
    verified_skills: c.verified_skills,
    top_revoked_at: c.top_revoked_at,
    rating: c.rating,
    reviews_count: c.reviews_count,
    jobs_done: c.jobs_done,
    documents_ok: !!c.documents_verified_at,
  };
}

/** Xizmat turi kalitlari (`service_categories.key`); `withDelivery` — `delivery` ham ruxsat. */
export async function normalizeSkills(input: string[], withDelivery = true): Promise<string[]> {
  const list = [...new Set((input || []).map((x) => String(x).trim()).filter(Boolean))];
  if (!list.length) throw new BadRequestException("Ro'yxat bo'sh bo'lmasin");
  const rows: any[] = await Crew.sequelize.query('SELECT key FROM service_categories', { type: QueryTypes.SELECT });
  const known = new Set([...(withDelivery ? ['delivery'] : []), ...rows.map((x) => String(x.key))]);
  const unknown = list.filter((x) => !known.has(x));
  if (unknown.length) throw new BadRequestException(`Noma'lum xizmat turi: ${unknown.join(', ')}`);
  return list;
}

export function normalizeAreas(input: any[]) {
  const out: { region_code: string; district_code?: string }[] = [];
  for (const r of input || []) {
    if (!isRegion(r?.region_code)) throw new BadRequestException(`Noma'lum viloyat: ${r?.region_code}`);
    if (r.district_code && !isDistrict(r.district_code, r.region_code)) {
      throw new BadRequestException(`${r.district_code} tumani ${r.region_code} ga tegishli emas`);
    }
    out.push({ region_code: r.region_code, ...(r.district_code ? { district_code: r.district_code } : {}) });
  }
  return out;
}

export { ServiceJobWorker };
