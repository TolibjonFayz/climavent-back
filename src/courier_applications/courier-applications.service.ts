import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Op, QueryTypes, Transaction, UniqueConstraintError } from 'sequelize';
import { OfferVersion } from 'src/offers/model/offer-version.model';
import { OfferAcceptance } from 'src/offers/model/offer-acceptance.model';
import { StoreUser } from 'src/store_users/model/store_user.model';
import { hashToken } from 'src/store_auth/password-setup.service';
import { Courier, CourierDocument, CourierVehicle, CourierVehicleEvent } from 'src/deliveries/model/models';
import { LICENSE_FOR_VEHICLE } from 'src/deliveries/constants';
import { recordCourierEvent } from 'src/deliveries/courier-events';
import { pushTo, pushToRawToken } from 'src/deliveries/push';
import { isDistrict, isRegion } from 'src/regions/regions.data';
import { Crew, CrewInvite } from 'src/crews/models';
import { createCrewForLeader, hashInviteToken, joinCrewByInvite } from 'src/crews/crews.service';
import { refreshCourierTrust, refreshCrewTrust } from 'src/crews/trust';
import {
  APP_DOC_MAX_BYTES,
  APP_DOCS_MAX,
  CourierApplication,
  CourierApplicationDocument,
  CourierApplicationDocumentBlob,
  CourierApplicationEvent,
  CrewInput,
  DOC_URL_TTL_MS,
  normalizePhoneDigits,
  OPEN_STATUSES,
  ORPHAN_TTL_MS,
  PHONE_BUSY_STATUSES,
  REJECTED_DOCS_RETENTION_DAYS,
  requiredApplicationDocs,
  VehicleInput,
} from './models';
import {
  ApproveCourierApplicationDto,
  CreateCourierApplicationDto,
  CrewInputDto,
  CrewMemberApplicationDto,
  ResubmitCourierApplicationDto,
} from './dto';

export interface Ctx {
  ip?: string;
  userAgent?: string;
}
export interface Actor {
  id: number | null;
  login: string | null;
}
const NO_ACTOR: Actor = { id: null, login: null };
const SALT_ROUNDS = 12;
/** Bog'lanmagan yuklamalarning jami hajmi chegarasi (baza cheksiz emas). */
const ORPHAN_BYTES_MAX = 500 * 1024 * 1024;

// Tur mijoz aytgan mimetype bo'yicha emas, faylning o'z imzosi bo'yicha (№16 qoidasi)
const ALLOWED = [
  { mime: 'application/pdf', test: (b: Buffer) => b.length > 5 && b.subarray(0, 5).toString('ascii') === '%PDF-' },
  { mime: 'image/jpeg', test: (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b: Buffer) =>
      b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
];

/** Ariza maydonlari (DTO -> model). */
const FIELDS = [
  'full_name',
  'birth_date',
  'skills',
  'regions',
  'employment_type',
  'tin',
  'vehicle',
  'license_categories',
  'experience',
  'comment',
] as const;

/**
 * Kuryer / usta bo'lish arizasi — topshiriq №41.
 *
 * Tuzilma sotuvchi arizasi (№16) bilan bir xil: hujjatlar alohida yuklanadi
 * (yopiq, bazada), holat — ochiq token bilan, `needs_info` -> to'ldirish,
 * tasdiqlash BITTA tranzaksiyada. Farqi: parolni nomzod o'zi qo'yadi va login —
 * telefon raqami; tasdiqlangach darhol kiradi.
 */
@Injectable()
export class CourierApplicationsService {
  private readonly logger = new Logger(CourierApplicationsService.name);

  // ================================================================ OMMAVIY
  async uploadDocument(file: Express.Multer.File | undefined, type: string) {
    if (!file || !file.buffer?.length) throw new BadRequestException('Fayl yuborilmadi');
    if (file.size > APP_DOC_MAX_BYTES) throw new BadRequestException("Fayl 10 MB dan katta bo'lmasin");
    const detected = ALLOWED.find((t) => t.test(file.buffer));
    if (!detected) throw new BadRequestException('Faqat rasm (JPG, PNG) yoki PDF yuklash mumkin');
    const pending = Number(
      (await CourierApplicationDocument.sum('size', { where: { application_id: null } })) || 0,
    );
    if (pending + file.size > ORPHAN_BYTES_MAX) {
      throw new ServiceUnavailableException("Hozir fayl qabul qilib bo'lmaydi, birozdan keyin urinib ko'ring");
    }
    const doc = await CourierApplicationDocument.sequelize.transaction(async (transaction) => {
      const d = await CourierApplicationDocument.create(
        {
          type,
          storage: 'db',
          file_key: randomBytes(24).toString('hex'),
          original_name: safeName(file.originalname),
          mime: detected.mime,
          size: file.size,
        } as any,
        { transaction },
      );
      await CourierApplicationDocumentBlob.create({ document_id: d.id, data: file.buffer } as any, { transaction });
      return d;
    });
    return { id: doc.id, type: doc.type, original_name: doc.original_name, size: doc.size };
  }

  async create(dto: CreateCourierApplicationDto, ctx: Ctx) {
    if (dto.offer_accepted !== true) throw new BadRequestException('Ofertani qabul qilish shart');
    const offer = await OfferVersion.findOne({ where: { kind: 'courier', is_current: true } });
    if (!offer) throw new ServiceUnavailableException("Kuryer ofertasi hali e'lon qilinmagan");
    if (dto.offer_version !== offer.version) {
      throw new ConflictException(`Oferta yangilangan (joriy versiya ${offer.version}) — qayta tanishib chiqing`);
    }

    const fields = pick(dto);
    await this.validate(fields);
    // Telefon bandligi hujjatlardan OLDIN: asl sabab (409) "hujjat yetishmaydi" ortida qolmasin
    await this.ensurePhoneFree(dto.phone);
    // Brigada (№44, 1.2): skills — BRIGADANIKI; a'zolar telefoni №41 dagi 409 qoidalariga tushadi
    const applicantType = dto.applicant_type === 'crew' ? 'crew' : 'individual';
    if (applicantType !== 'crew' && dto.crew) throw new BadRequestException("crew faqat applicant_type = crew bo'lganda");
    const crew = applicantType === 'crew' ? await this.validateCrew(dto.crew, dto.phone) : null;

    const docIds = [...new Set(dto.document_ids || [])];
    if (docIds.length > APP_DOCS_MAX) throw new BadRequestException(`Bitta arizada eng ko'pi ${APP_DOCS_MAX} ta fayl`);
    const docs = await this.loadFreeDocuments(docIds);
    this.ensureRequired(fields, docs.map((d) => d.type));

    const rawToken = randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    try {
      const app = await CourierApplication.sequelize.transaction(async (transaction) => {
        const created = await CourierApplication.create(
          {
            ...fields,
            phone: dto.phone,
            status: 'pending',
            applicant_type: applicantType,
            crew,
            password_hash: passwordHash,
            lang: dto.lang ?? null,
            push_token: dto.push_token ?? null,
            push_platform: dto.push_platform ?? null,
            public_token_hash: hashToken(rawToken),
            offer_version: offer.version,
            offer_accepted_at: new Date(),
            offer_ip: ctx.ip ?? null,
            offer_user_agent: ctx.userAgent?.slice(0, 500) ?? null,
          } as any,
          { transaction },
        );
        await this.linkDocuments(docIds, created.id, transaction);
        await this.event(
          created.id,
          'created',
          NO_ACTOR,
          `${crew ? `Brigada «${crew.name}» (${crew.members_count} kishi): ` : ''}${fields.skills.join(', ')}`,
          transaction,
        );
        // Shartnoma tuzilganining DALILI (faqat INSERT — baza trigger'i himoya qiladi)
        await OfferAcceptance.create(
          {
            kind: 'courier',
            version: offer.version,
            courier_application_id: created.id,
            accepted_at: created.offer_accepted_at,
            ip: ctx.ip ?? null,
            user_agent: ctx.userAgent?.slice(0, 500) ?? null,
          } as any,
          { transaction },
        );
        return created;
      });
      await this.notifySuperadmins(app);
      return { id: app.id, status: app.status, public_token: rawToken };
    } catch (e) {
      if (e instanceof UniqueConstraintError) throw new ConflictException('Bu raqam bilan ariza allaqachon bor');
      throw e;
    }
  }

  async status(token: string) {
    const app = await this.byToken(token);
    return this.statusView(app);
  }

  /**
   * Brigada taklifi bilan a'zo arizasi (№44, 1.3) — `POST /crew-invites/:token/accept`.
   * Qisqa ariza: shaxsiy + pasport + selfi; ko'nikma va hudud brigadadan. Superadmin
   * tasdig'idan o'tadi (pasportsiz odam platformaga kirmaydi), tasdiqlangach — avtomatik a'zo.
   */
  async createFromInvite(token: string, dto: CrewMemberApplicationDto, ctx: Ctx) {
    if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) throw new NotFoundException('Taklif topilmadi');
    const invite = await CrewInvite.findOne({ where: { token_hash: hashInviteToken(token) } });
    if (!invite) throw new NotFoundException('Taklif topilmadi');
    if (invite.revoked_at) throw new GoneException('Taklif bekor qilingan');
    if (invite.accepted_at || invite.application_id) throw new ConflictException('Bu taklif bilan ariza allaqachon topshirilgan');
    if (new Date(invite.expires_at).getTime() < Date.now()) throw new GoneException("Taklif muddati o'tgan — boshliqdan yangisini so'rang");
    const crew = await Crew.findByPk(invite.crew_id);
    if (!crew || !crew.is_active) throw new ConflictException('Brigada faol emas');
    if (dto.phone !== invite.phone) throw new BadRequestException("Taklif boshqa raqam uchun yuborilgan — boshliqdan so'rang");

    if (dto.offer_accepted !== true) throw new BadRequestException('Ofertani qabul qilish shart');
    const offer = await OfferVersion.findOne({ where: { kind: 'courier', is_current: true } });
    if (!offer) throw new ServiceUnavailableException("Kuryer ofertasi hali e'lon qilinmagan");
    if (dto.offer_version !== offer.version) {
      throw new ConflictException(`Oferta yangilangan (joriy versiya ${offer.version}) — qayta tanishib chiqing`);
    }
    if (!!dto.employment_type !== !!dto.tin) throw new BadRequestException('employment_type va tin birga beriladi');

    // Brigada xizmatlari (yetkazish — alohida, transport bilan ariza orqali)
    const skills = (crew.skills || []).filter((s) => s !== 'delivery');
    const fields: any = {
      full_name: dto.full_name.trim(),
      birth_date: dto.birth_date,
      skills: skills.length ? skills : crew.skills,
      regions: crew.service_areas || [],
      employment_type: dto.employment_type ?? null,
      tin: dto.tin ?? null,
      vehicle: null,
      license_categories: [],
      experience: dto.experience?.trim() || null,
      comment: `Brigada «${crew.name}» taklifi`,
    };
    await this.validate(fields, { member: true });
    await this.ensurePhoneFree(dto.phone);
    const docIds = [...new Set(dto.document_ids || [])];
    if (docIds.length > APP_DOCS_MAX) throw new BadRequestException(`Bitta arizada eng ko'pi ${APP_DOCS_MAX} ta fayl`);
    const docs = await this.loadFreeDocuments(docIds);
    this.ensureRequired(fields, docs.map((d) => d.type));

    const rawToken = randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    try {
      const app = await CourierApplication.sequelize.transaction(async (transaction) => {
        const created = await CourierApplication.create(
          {
            ...fields,
            phone: dto.phone,
            status: 'pending',
            applicant_type: 'crew_member',
            crew_invite_id: invite.id,
            password_hash: passwordHash,
            lang: dto.lang ?? null,
            push_token: dto.push_token ?? null,
            push_platform: dto.push_platform ?? null,
            public_token_hash: hashToken(rawToken),
            offer_version: offer.version,
            offer_accepted_at: new Date(),
            offer_ip: ctx.ip ?? null,
            offer_user_agent: ctx.userAgent?.slice(0, 500) ?? null,
          } as any,
          { transaction },
        );
        // Poyga: bitta taklif — bitta ariza (shartli yangilash)
        const [linked] = await CrewInvite.update(
          { application_id: created.id } as any,
          { where: { id: invite.id, application_id: null, accepted_at: null, revoked_at: null }, transaction },
        );
        if (!linked) throw new ConflictException('Bu taklif bilan ariza allaqachon topshirilgan');
        await this.linkDocuments(docIds, created.id, transaction);
        await this.event(created.id, 'created', NO_ACTOR, `Brigada #${crew.id} «${crew.name}» a'zosi (taklif #${invite.id})`, transaction);
        await OfferAcceptance.create(
          {
            kind: 'courier',
            version: offer.version,
            courier_application_id: created.id,
            accepted_at: created.offer_accepted_at,
            ip: ctx.ip ?? null,
            user_agent: ctx.userAgent?.slice(0, 500) ?? null,
          } as any,
          { transaction },
        );
        return created;
      });
      await this.notifySuperadmins(app);
      return { id: app.id, status: app.status, public_token: rawToken, crew: { id: crew.id, name: crew.name } };
    } catch (e) {
      if (e instanceof UniqueConstraintError) throw new ConflictException('Bu raqam bilan ariza allaqachon bor');
      throw e;
    }
  }

  async resubmit(token: string, dto: ResubmitCourierApplicationDto) {
    const app = await this.byToken(token);
    if (app.status !== 'needs_info') {
      throw new ConflictException("Arizani faqat ma'lumot so'ralganda to'ldirish mumkin");
    }
    const changes = pick(dto, true);
    const merged: any = { ...pick(app as any), ...changes };
    await this.validate(merged, { member: app.applicant_type === 'crew_member' });

    const own = await CourierApplicationDocument.findAll({ where: { application_id: app.id }, attributes: ['id', 'type', 'deleted_at'] });
    const ownIds = new Set(own.map((d) => d.id));
    const newIds = [...new Set(dto.document_ids || [])].filter((x) => !ownIds.has(x));
    const newDocs = await this.loadFreeDocuments(newIds);
    const existing = own.filter((d) => !d.deleted_at);
    if (existing.length + newDocs.length > APP_DOCS_MAX) {
      throw new BadRequestException(`Bitta arizada eng ko'pi ${APP_DOCS_MAX} ta fayl`);
    }
    this.ensureRequired(merged, [...existing.map((d) => d.type), ...newDocs.map((d) => d.type)]);
    // Superadmin aynan qaysi hujjatni qayta so'ragan bo'lsa — YANGI fayl kerak
    const stillMissing = (app.missing_documents || []).filter((t) => !newDocs.some((d) => d.type === t));
    if (stillMissing.length) {
      throw new BadRequestException({ statusCode: 400, message: `Yangi hujjat kerak: ${stillMissing.join(', ')}`, missing: stillMissing });
    }

    await CourierApplication.sequelize.transaction(async (transaction) => {
      await app.update(
        {
          ...changes,
          ...(dto.push_token !== undefined ? { push_token: dto.push_token } : {}),
          ...(dto.push_platform !== undefined ? { push_platform: dto.push_platform } : {}),
          status: 'pending',
          missing_documents: [],
        } as any,
        { transaction },
      );
      await this.linkDocuments(newIds, app.id, transaction);
      const changed = Object.keys(changes);
      await this.event(
        app.id,
        'resubmitted',
        NO_ACTOR,
        [changed.length ? `maydonlar: ${changed.join(', ')}` : null, newDocs.length ? `hujjatlar: ${newDocs.map((d) => d.type).join(', ')}` : null]
          .filter(Boolean)
          .join('; ') || null,
        transaction,
      );
    });
    await app.reload();
    await this.notifySuperadmins(app, true);
    return this.statusView(app);
  }

  async withdraw(token: string) {
    const app = await this.byToken(token);
    if (!OPEN_STATUSES.includes(app.status)) throw new ConflictException('Arizani endi qaytarib olib bo\'lmaydi');
    await CourierApplication.sequelize.transaction(async (transaction) => {
      await app.update({ status: 'withdrawn', reviewed_at: new Date() } as any, { transaction });
      await this.event(app.id, 'withdrawn', NO_ACTOR, null, transaction);
    });
    return this.statusView(app);
  }

  // ============================================================= SUPERADMIN
  async list(q: { status?: string; skill?: string; region?: string; page?: number; limit?: number; search?: string }) {
    const limit = Math.min(Math.max(q.limit || 50, 1), 200);
    const page = Math.max(q.page || 1, 1);
    const where: any = {};
    if (q.status) where.status = q.status;
    if (q.skill) where.skills = { [Op.contains]: [q.skill] };
    const and: any[] = [];
    if (q.region) {
      and.push(
        CourierApplication.sequelize.literal(
          `regions @> ${CourierApplication.sequelize.escape(JSON.stringify([{ region_code: q.region }]))}::jsonb`,
        ),
      );
    }
    const s = (q.search || '').trim();
    if (s) where[Op.or] = [{ full_name: { [Op.iLike]: `%${s}%` } }, { phone: { [Op.iLike]: `%${s.replace(/\D/g, '') || s}%` } }];
    if (and.length) where[Op.and] = and;
    const { rows, count } = await CourierApplication.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    const counts = await this.docCounts(rows.map((r) => r.id));
    return { rows: rows.map((r) => adminView(r, counts.get(r.id) || 0)), total: count };
  }

  async getOne(id: number) {
    const app = await CourierApplication.findByPk(id);
    if (!app) throw new NotFoundException('Ariza topilmadi');
    const docs = await CourierApplicationDocument.findAll({ where: { application_id: id }, order: [['id', 'ASC']] });
    const events = await CourierApplicationEvent.findAll({ where: { application_id: id }, order: [['id', 'ASC']] });
    const have = docs.filter((d) => !d.deleted_at).map((d) => d.type);
    return {
      ...adminView(app, have.length),
      required_documents: requiredApplicationDocs(app),
      missing_required: requiredApplicationDocs(app).filter((t) => !have.includes(t)),
      documents: docs.map((d) => ({
        id: d.id,
        type: d.type,
        original_name: d.original_name,
        mime: d.mime,
        size: d.size,
        created_at: d.created_at,
        deleted_at: d.deleted_at,
        courier_document_id: d.courier_document_id,
      })),
      events,
    };
  }

  async documentUrl(id: number, docId: number, baseUrl: string) {
    const doc = await CourierApplicationDocument.findOne({ where: { id: docId, application_id: id } });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');
    if (doc.deleted_at) throw new GoneException("Hujjat saqlash muddati tugab o'chirilgan");
    const expiresAt = new Date(Date.now() + DOC_URL_TTL_MS);
    const payload = Buffer.from(`${doc.id}.${expiresAt.getTime()}`).toString('base64url');
    return {
      url: `${baseUrl}/api/courier-applications/documents/file?token=${encodeURIComponent(`${payload}.${hmac(payload)}`)}`,
      expires_at: expiresAt.toISOString(),
    };
  }

  /** Imzolangan havola bo'yicha fayl (tasdiqlangan arizada — kuryer hujjatidan). */
  async openSigned(token: string) {
    const [payload, signature] = String(token || '').split('.');
    if (!payload || !signature) throw new NotFoundException("Havola noto'g'ri");
    const expected = Buffer.from(hmac(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new NotFoundException("Havola noto'g'ri");
    const [idStr, expStr] = Buffer.from(payload, 'base64url').toString().split('.');
    if (!(Number(expStr) > Date.now())) throw new GoneException("Havola muddati o'tgan — adminkadan qayta oling");
    const doc = await CourierApplicationDocument.findByPk(Number(idStr));
    if (!doc) throw new NotFoundException('Hujjat topilmadi');
    if (doc.deleted_at) throw new GoneException("Hujjat saqlash muddati tugab o'chirilgan");
    let data: Buffer | null = null;
    if (doc.courier_document_id) {
      const [row]: any[] = await CourierApplication.sequelize.query(
        'SELECT data FROM courier_document_blobs WHERE document_id = :id',
        { replacements: { id: doc.courier_document_id }, type: QueryTypes.SELECT },
      );
      data = row?.data ?? null;
    } else {
      data = (await CourierApplicationDocumentBlob.findByPk(doc.id))?.data ?? null;
    }
    if (!data) throw new GoneException("Hujjat o'chirilgan");
    return { doc, data };
  }

  async requestInfo(id: number, message: string, missing: string[] | undefined, actor: Actor) {
    const app = await this.decide(id, async (a, t) => {
      await a.update({ status: 'needs_info', info_request: message.trim(), missing_documents: [...new Set(missing || [])] } as any, { transaction: t });
      await this.event(a.id, 'info_requested', actor, [message.trim(), missing?.length ? `hujjat: ${missing.join(', ')}` : null].filter(Boolean).join(' — '), t);
    });
    await this.notifyApplicant(app, 'application_needs_info');
    return this.getOne(id);
  }

  async reject(id: number, reason: string, actor: Actor) {
    const app = await this.decide(id, async (a, t) => {
      await a.update(
        { status: 'rejected', reject_reason: reason.trim(), reviewed_by: actor.id, reviewed_by_login: actor.login, reviewed_at: new Date() } as any,
        { transaction: t },
      );
      await this.event(a.id, 'rejected', actor, reason.trim(), t);
    });
    await this.notifyApplicant(app, 'application_rejected');
    return this.getOne(id);
  }

  async updateNote(id: number, note: string | null | undefined, actor: Actor) {
    const app = await CourierApplication.findByPk(id);
    if (!app) throw new NotFoundException('Ariza topilmadi');
    const value = note?.trim() || null;
    await CourierApplication.sequelize.transaction(async (t) => {
      await app.update({ admin_note: value } as any, { transaction: t });
      await this.event(app.id, 'note', actor, value, t);
    });
    return this.getOne(id);
  }

  /**
   * Tasdiqlash — BITTA TRANZAKSIYADA (4-band): hisob (login = telefon, parol —
   * arizadagi), kuryer profili (hujjatlari tasdiqlangan), transport (approved,
   * faol), hujjatlar ko'chadi (fayl qayta yuklanmaydi — baytlar server ichida),
   * oferta dalili yangi hisobga, ariza holati va tarix. Biror qadam yiqilsa — hammasi qaytadi.
   */
  async approve(id: number, dto: ApproveCourierApplicationDto, actor: Actor) {
    try {
      const out = await CourierApplication.sequelize.transaction(async (transaction) => {
        const app = await CourierApplication.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!app) throw new NotFoundException('Ariza topilmadi');
        if (!OPEN_STATUSES.includes(app.status)) throw new ConflictException('Ariza allaqachon yakuniy holatda');

        // A'zo — brigadasining hamkoriga tegishli (№44, 1.3)
        let memberCrew: Crew | null = null;
        if (app.applicant_type === 'crew_member') {
          const inv = app.crew_invite_id ? await CrewInvite.findByPk(app.crew_invite_id, { transaction }) : null;
          memberCrew = inv ? await Crew.findByPk(inv.crew_id, { transaction }) : null;
          if (!inv || inv.revoked_at || !memberCrew || !memberCrew.is_active) {
            throw new ConflictException('Brigada taklifi bekor qilingan yoki brigada faol emas');
          }
          if (dto.store_id !== undefined && (dto.store_id ?? null) !== (memberCrew.store_id ?? null)) {
            throw new BadRequestException("store_id: a'zo brigadasining hamkoriga tegishli bo'ladi");
          }
        }
        const storeId = memberCrew ? memberCrew.store_id ?? null : dto.store_id ?? null;
        if (storeId !== null) {
          const [store]: any[] = await CourierApplication.sequelize.query('SELECT id, is_active FROM stores WHERE id = :id', {
            replacements: { id: storeId },
            type: QueryTypes.SELECT,
            transaction,
          });
          if (!store || !store.is_active) throw new BadRequestException("store_id: do'kon yo'q yoki nofaol");
        }
        const skills = dto.skills ? [...new Set(dto.skills)] : app.skills;
        const license = (dto.license_categories ?? app.license_categories ?? []).map((c) => c.toUpperCase());
        await this.validate({ ...pick(app as any), skills, license_categories: license }, { member: app.applicant_type === 'crew_member' });

        const digits = normalizePhoneDigits(app.phone)!;
        await this.ensureAccountFree(app.phone, transaction);

        const account = await StoreUser.create(
          {
            login: digits,
            full_name: app.full_name,
            role: 'courier',
            store_id: storeId,
            is_active: true,
            password_hash: app.password_hash,
            phone: app.phone,
          } as any,
          { transaction },
        );
        if (app.lang) {
          await CourierApplication.sequelize
            .query('UPDATE store_users SET lang = :lang WHERE id = :id', { replacements: { lang: app.lang, id: account.id }, transaction })
            .catch(() => undefined);
        }
        const courier = await Courier.create(
          {
            store_user_id: account.id,
            store_id: storeId,
            full_name: app.full_name,
            phone: app.phone,
            vehicle_type: app.vehicle?.vehicle_type ?? null,
            skills,
            employment_type: app.employment_type,
            tin: app.tin,
            license_categories: license,
            documents_verified_at: new Date(),
            verified_by: actor.id,
            service_areas: app.regions || [],
          } as any,
          { transaction },
        );

        let vehicleId: number | null = null;
        if (app.vehicle?.vehicle_type) {
          const v = await CourierVehicle.create(
            {
              courier_id: courier.id,
              vehicle_type: app.vehicle.vehicle_type,
              plate: app.vehicle.plate?.trim() || null,
              model: app.vehicle.model?.trim() || null,
              color: app.vehicle.color?.trim() || null,
              owner: app.vehicle.owner || 'own',
              status: 'approved',
              verified_at: new Date(),
              verified_by: actor.id,
            } as any,
            { transaction },
          );
          await CourierVehicleEvent.create(
            {
              vehicle_id: v.id,
              courier_id: courier.id,
              from_status: null,
              to_status: 'approved',
              actor_type: 'superadmin',
              actor_id: actor.id,
              comment: `Ariza #${app.id} bilan tasdiqlandi`,
              created_at: new Date(),
            } as any,
            { transaction },
          );
          await courier.update({ active_vehicle_id: v.id } as any, { transaction });
          vehicleId = v.id;
        }

        // Hujjatlar kuryerga ko'chadi: baytlar server ichida nusxalanadi, ariza nusxasi o'chadi
        const docs = await CourierApplicationDocument.findAll({ where: { application_id: app.id, deleted_at: null }, transaction });
        for (const d of docs) {
          const cd = await CourierDocument.create(
            {
              courier_id: courier.id,
              vehicle_id: d.type === 'vehicle_registration' ? vehicleId : null,
              type: d.type,
              storage: 'db',
              file_key: d.file_key,
              original_name: d.original_name,
              mime: d.mime,
              size: d.size,
              uploaded_by: null,
            } as any,
            { transaction },
          );
          await CourierApplication.sequelize.query(
            `INSERT INTO courier_document_blobs (document_id, data)
             SELECT :cd, data FROM courier_application_document_blobs WHERE document_id = :ad`,
            { replacements: { cd: cd.id, ad: d.id }, transaction },
          );
          await CourierApplicationDocumentBlob.destroy({ where: { document_id: d.id }, transaction });
          await d.update({ courier_document_id: cd.id } as any, { transaction });
        }

        // Ariza paytidagi oferta dalili YANGI hisobga ham (faqat INSERT) — birinchi kirishda qayta so'ralmaydi
        await OfferAcceptance.create(
          {
            kind: 'courier',
            version: app.offer_version,
            courier_application_id: app.id,
            store_user_id: account.id,
            store_id: storeId,
            accepted_at: app.offer_accepted_at,
            ip: app.offer_ip,
            user_agent: app.offer_user_agent,
          } as any,
          { transaction },
        );

        await app.update(
          {
            status: 'approved',
            courier_id: courier.id,
            store_user_id: account.id,
            skills,
            license_categories: license,
            reviewed_by: actor.id,
            reviewed_by_login: actor.login,
            reviewed_at: new Date(),
          } as any,
          { transaction },
        );
        // Brigada (№44): boshliq arizasi — brigada + boshliq a'zoligi; a'zo — avtomatik a'zo.
        // `members` dagilarga hisob OCHILMAYDI (taklif havolasi bilan o'zlari keladi).
        let crew: Crew | null = null;
        if (app.applicant_type === 'crew' && app.crew) {
          crew = await createCrewForLeader(
            { name: app.crew.name, members_count: app.crew.members_count, skills, service_areas: app.regions || [], store_id: storeId, leader: courier },
            transaction,
          );
        } else if (memberCrew && app.crew_invite_id) {
          crew = await joinCrewByInvite(app.crew_invite_id, courier, transaction);
        }
        await this.event(
          app.id,
          'approved',
          actor,
          `Kuryer #${courier.id}, login ${digits}${storeId ? `, do'kon #${storeId}` : ', platforma'}${crew ? `, brigada #${crew.id}` : ''}`,
          transaction,
        );
        await recordCourierEvent(courier.id, 'created_from_application', { role: 'superadmin', user_id: actor.id, login: actor.login }, `Ariza #${app.id}`, transaction);
        return {
          app,
          body: {
            courier: { ...courier.get({ plain: true }), login: digits },
            store_user: { id: account.id, login: account.login },
            crew: crew ? { id: crew.id, name: crew.name, role: app.applicant_type === 'crew' ? 'leader' : 'member' } : null,
          },
        };
      });
      await this.notifyApplicant(out.app, 'application_approved');
      // Ishonch darajasi (№44): hujjatlari tasdiqlangan — `documents`
      await refreshCourierTrust([out.body.courier.id]);
      if (out.body.crew) await refreshCrewTrust([out.body.crew.id]);
      return out.body;
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        const f = Object.keys((e as any).fields || {}).join(',');
        throw new ConflictException(f.includes('phone') ? 'Bu raqam bilan kuryer allaqachon bor' : 'Bu login band');
      }
      throw e;
    }
  }

  // ============================================================ FON ISHI (6-band)
  async runMaintenance() {
    const orphans = await CourierApplicationDocument.destroy({
      where: { application_id: null, created_at: { [Op.lt]: new Date(Date.now() - ORPHAN_TTL_MS) } },
    });
    const cutoff = new Date(Date.now() - REJECTED_DOCS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const apps = await CourierApplication.findAll({
      where: { status: { [Op.in]: ['rejected', 'withdrawn'] }, reviewed_at: { [Op.lt]: cutoff } },
      attributes: ['id'],
    });
    let purged = 0;
    for (const a of apps) {
      const docs = await CourierApplicationDocument.findAll({ where: { application_id: a.id, deleted_at: null }, attributes: ['id'] });
      if (!docs.length) continue;
      await CourierApplication.sequelize.transaction(async (t) => {
        const ids = docs.map((d) => d.id);
        await CourierApplicationDocumentBlob.destroy({ where: { document_id: ids }, transaction: t });
        await CourierApplicationDocument.update({ deleted_at: new Date() } as any, { where: { id: ids }, transaction: t });
        await this.event(a.id, 'documents_purged', NO_ACTOR, `${ids.length} ta fayl ${REJECTED_DOCS_RETENTION_DAYS} kundan keyin o'chirildi`, t);
      });
      purged += docs.length;
    }
    if (orphans || purged) this.logger.log(`Kuryer arizalari: ${orphans} ta bog'lanmagan yuklama, ${purged} ta hujjat o'chirildi`);
    return { orphans, purged };
  }

  // ============================================================ YORDAMCHILAR
  private async validate(f: any, opts: { member?: boolean } = {}) {
    // Yosh: 18 dan kichik — 400
    const bd = new Date(`${f.birth_date}T00:00:00Z`);
    if (Number.isNaN(bd.getTime())) throw new BadRequestException("birth_date noto'g'ri sana");
    const now = new Date();
    const adult = new Date(Date.UTC(bd.getUTCFullYear() + 18, bd.getUTCMonth(), bd.getUTCDate()));
    if (adult.getTime() > now.getTime()) throw new BadRequestException('18 yoshdan kichik nomzod ariza bera olmaydi');
    if (bd.getUTCFullYear() < 1930) throw new BadRequestException("birth_date noto'g'ri");

    const skills: string[] = [...new Set((f.skills || []) as string[])];
    if (!skills.length) throw new BadRequestException("skills bo'sh bo'lmasin");
    const rows: any[] = await CourierApplication.sequelize.query('SELECT key FROM service_categories WHERE is_active', {
      type: QueryTypes.SELECT,
    });
    const known = new Set(['delivery', ...rows.map((r) => String(r.key))]);
    const unknown = skills.filter((s) => !known.has(s));
    if (unknown.length) throw new BadRequestException(`Noma'lum ko'nikma: ${unknown.join(', ')}`);

    const regions = f.regions || [];
    // A'zo arizasi (№44): hudud brigadadan — bo'sh bo'lishi mumkin
    if (!regions.length && !opts.member) throw new BadRequestException('regions: kamida bitta hudud');
    for (const r of regions) {
      if (!isRegion(r.region_code)) throw new BadRequestException(`Noma'lum viloyat: ${r.region_code}`);
      if (r.district_code && !isDistrict(r.district_code, r.region_code)) {
        throw new BadRequestException(`${r.district_code} tumani ${r.region_code} ga tegishli emas`);
      }
    }

    const vehicle: VehicleInput | null = f.vehicle ?? null;
    if (skills.includes('delivery') && !vehicle?.vehicle_type) {
      throw new BadRequestException("vehicle majburiy: skills da 'delivery' bor");
    }
    if (vehicle && ['car', 'van', 'truck'].includes(vehicle.vehicle_type)) {
      const need = LICENSE_FOR_VEHICLE[vehicle.vehicle_type];
      const have = (f.license_categories || []).map((c: string) => c.toUpperCase());
      if (!have.length) throw new BadRequestException(`license_categories majburiy (${vehicle.vehicle_type})`);
      if (need && !have.includes(need)) {
        throw new BadRequestException(`${vehicle.vehicle_type} uchun ${need} toifali guvohnoma kerak`);
      }
    }
  }

  /** Brigada ma'lumoti (№44, 1.2): a'zolar raqami noyob, arizachiniki emas, band emas (409). */
  private async validateCrew(crew: CrewInputDto | undefined, applicantPhone: string): Promise<CrewInput> {
    if (!crew) throw new BadRequestException('crew majburiy: applicant_type = crew');
    const members = crew.members || [];
    if (members.length > crew.members_count - 1) {
      throw new BadRequestException(`members: ko'pi bilan ${crew.members_count - 1} kishi (boshliqsiz)`);
    }
    const phones = new Set<string>();
    for (const m of members) {
      if (m.phone === applicantPhone) throw new BadRequestException("members: boshliq raqami a'zolar ichida bo'lmasin");
      if (phones.has(m.phone)) throw new BadRequestException(`members: ${m.phone} takrorlangan`);
      phones.add(m.phone);
      try {
        await this.ensurePhoneFree(m.phone);
      } catch (e) {
        if (e instanceof ConflictException) throw new ConflictException(`A'zo raqami band (${m.phone}) — u o'zi kirishi yoki taklif bilan kelishi kerak`);
        throw e;
      }
    }
    if (members.some((m) => m.skills?.length)) {
      const rows: any[] = await CourierApplication.sequelize.query('SELECT key FROM service_categories WHERE is_active', { type: QueryTypes.SELECT });
      const known = new Set(['delivery', ...rows.map((r) => String(r.key))]);
      const bad = [...new Set(members.flatMap((m) => m.skills || []))].filter((s) => !known.has(s));
      if (bad.length) throw new BadRequestException(`members[].skills: noma'lum — ${bad.join(', ')}`);
    }
    return {
      name: crew.name.trim(),
      members_count: crew.members_count,
      members: members.map((m) => ({ full_name: m.full_name.trim(), phone: m.phone, ...(m.skills?.length ? { skills: [...new Set(m.skills)] } : {}) })),
    };
  }

  private ensureRequired(f: any, types: string[]) {
    const missing = requiredApplicationDocs(f).filter((t) => !types.includes(t));
    if (missing.length) {
      throw new BadRequestException({ statusCode: 400, message: `Majburiy hujjat yetishmaydi: ${missing.join(', ')}`, missing });
    }
  }

  /** Telefon: ochiq/tasdiqlangan ariza yoki mavjud hisob — 409. */
  private async ensurePhoneFree(phone: string) {
    const busy = await CourierApplication.findOne({ where: { phone, status: { [Op.in]: PHONE_BUSY_STATUSES } }, attributes: ['id'] });
    if (busy) throw new ConflictException('Bu raqam bilan ariza allaqachon bor');
    await this.ensureAccountFree(phone);
  }

  private async ensureAccountFree(phone: string, transaction?: Transaction) {
    const digits = normalizePhoneDigits(phone);
    const [row]: any[] = await CourierApplication.sequelize.query(
      `SELECT (SELECT COUNT(*) FROM store_users WHERE login IN (:d, :c) OR phone = :p)::int
            + (SELECT COUNT(*) FROM couriers WHERE phone = :p)::int AS n`,
      { replacements: { d: digits, c: `c${digits}`, p: phone }, type: QueryTypes.SELECT, transaction },
    );
    if (Number(row?.n) > 0) throw new ConflictException("Bu raqam bilan hisob bor — kirish sahifasidan kiring");
  }

  private async loadFreeDocuments(ids: number[]) {
    if (!ids.length) return [];
    const docs = await CourierApplicationDocument.findAll({
      where: {
        id: { [Op.in]: ids },
        application_id: null,
        deleted_at: null,
        created_at: { [Op.gt]: new Date(Date.now() - ORPHAN_TTL_MS) },
      },
      attributes: ['id', 'type'],
    });
    if (docs.length !== ids.length) {
      throw new BadRequestException("document_ids: hujjat topilmadi, muddati o'tgan yoki boshqa arizaga bog'langan");
    }
    return docs;
  }

  private async linkDocuments(ids: number[], applicationId: number, transaction: Transaction) {
    if (!ids.length) return;
    const [n] = await CourierApplicationDocument.update(
      { application_id: applicationId } as any,
      { where: { id: { [Op.in]: ids }, application_id: null }, transaction },
    );
    if (n !== ids.length) throw new BadRequestException("document_ids: hujjat boshqa arizaga bog'langan");
  }

  private async byToken(token: string) {
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) throw new NotFoundException('Ariza topilmadi');
    const app = await CourierApplication.findOne({ where: { public_token_hash: hashToken(token) } });
    if (!app) throw new NotFoundException('Ariza topilmadi');
    return app;
  }

  /** Holat sahifasi — pasport, TIN, parol, ichki izoh QAYTMAYDI. */
  private async statusView(app: CourierApplication) {
    let missing: string[] = [];
    if (app.status === 'needs_info') {
      const have = (
        await CourierApplicationDocument.findAll({ where: { application_id: app.id, deleted_at: null }, attributes: ['type'] })
      ).map((d) => d.type);
      missing = [...new Set([...(app.missing_documents || []), ...requiredApplicationDocs(app).filter((t) => !have.includes(t))])];
    }
    return {
      status: app.status,
      full_name: app.full_name,
      skills: app.skills,
      created_at: app.created_at,
      info_request: app.status === 'needs_info' ? app.info_request : null,
      missing_documents: missing,
      reject_reason: app.status === 'rejected' ? app.reject_reason : null,
      login: app.status === 'approved' ? normalizePhoneDigits(app.phone) : null,
      // №44: brigada (a'zolar telefoni qaytmaydi)
      applicant_type: app.applicant_type,
      crew: await this.crewStatus(app),
    };
  }

  private async crewStatus(app: CourierApplication) {
    if (app.applicant_type === 'crew' && app.crew) {
      return { name: app.crew.name, members_count: app.crew.members_count, members: (app.crew.members || []).map((m) => ({ full_name: m.full_name })) };
    }
    if (app.applicant_type === 'crew_member' && app.crew_invite_id) {
      const inv = await CrewInvite.findByPk(app.crew_invite_id, { attributes: ['crew_id'] });
      const crew = inv ? await Crew.findByPk(inv.crew_id, { attributes: ['id', 'name', 'members_count'] }) : null;
      return crew ? { name: crew.name, members_count: crew.members_count } : null;
    }
    return null;
  }

  private async decide(id: number, apply: (a: CourierApplication, t: Transaction) => Promise<void>) {
    return CourierApplication.sequelize.transaction(async (t) => {
      const app = await CourierApplication.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!app) throw new NotFoundException('Ariza topilmadi');
      if (!OPEN_STATUSES.includes(app.status)) throw new ConflictException('Ariza allaqachon yakuniy holatda');
      await apply(app, t);
      return app;
    });
  }

  private async docCounts(ids: number[]) {
    const map = new Map<number, number>();
    if (!ids.length) return map;
    const rows: any[] = await CourierApplication.sequelize.query(
      `SELECT application_id, COUNT(*)::int AS n FROM courier_application_documents
        WHERE application_id IN (:ids) AND deleted_at IS NULL GROUP BY application_id`,
      { replacements: { ids }, type: QueryTypes.SELECT },
    );
    rows.forEach((r) => map.set(Number(r.application_id), Number(r.n)));
    return map;
  }

  private event(applicationId: number, type: string, actor: Actor, message: string | null, transaction?: Transaction) {
    return CourierApplicationEvent.create(
      { application_id: applicationId, type, actor_id: actor.id, actor_login: actor.login, message: message ? message.slice(0, 2000) : null, created_at: new Date() } as any,
      { transaction },
    );
  }

  /** Nomzodga qaror haqida push (5-band). SMS yo'q. Token bo'lmasa — holat sahifasi baribir biladi. */
  private async notifyApplicant(app: CourierApplication, event: 'application_approved' | 'application_needs_info' | 'application_rejected') {
    const ru = app.lang === 'ru';
    const text: Record<string, [string, string]> = ru
      ? {
          application_approved: ['Заявка одобрена', 'Войдите в приложение'],
          application_needs_info: ['Нужны дополнительные данные', 'Откройте заявку в приложении'],
          application_rejected: ['Заявка отклонена', 'Подробности — в приложении'],
        }
      : {
          application_approved: ['Arizangiz tasdiqlandi', 'Ilovaga kiring'],
          application_needs_info: ["Arizangizga qo'shimcha ma'lumot kerak", 'Ilovada arizani oching'],
          application_rejected: ['Arizangiz rad etildi', 'Batafsil — ilovada'],
        };
    try {
      const r = await pushToRawToken(
        app.push_token,
        {
          title: text[event][0],
          body: text[event][1],
          data: { type: 'courier_application', event, status: app.status },
          channel: 'orders',
        },
        `kuryer arizasi #${app.id} (${event})`,
      );
      await this.event(app.id, r.sent ? 'notified' : 'notify_failed', NO_ACTOR, `${event}: ${r.sent ? 'push yuborildi' : r.errors[0] || (app.push_token ? 'yuborilmadi' : "push_token yo'q")}`);
    } catch (e) {
      this.logger.warn(`Nomzodga push yuborilmadi (#${app.id}): ${(e as Error).message}`);
    }
  }

  /** Yangi ariza — superadminlarga push (3-band). Adminka nishoni X-Total-Count dan. */
  private async notifySuperadmins(app: CourierApplication, resubmitted = false) {
    try {
      const rows: any[] = await CourierApplication.sequelize.query(
        `SELECT id FROM store_users WHERE role = 'superadmin' AND is_active`,
        { type: QueryTypes.SELECT },
      );
      await pushTo(
        'store_user',
        rows.map((r) => Number(r.id)),
        {
          title: resubmitted ? "Kuryer arizasi to'ldirildi" : 'Yangi kuryer arizasi',
          body: `${app.full_name} · ${app.skills.join(', ')}`.slice(0, 180),
          data: { type: 'courier_application', id: app.id },
        },
        { label: `kuryer arizasi #${app.id}, superadminlar` },
      );
    } catch (e) {
      this.logger.warn(`Superadminlarga push yuborilmadi: ${(e as Error).message}`);
    }
  }
}

function pick(src: any, onlyPresent = false): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of FIELDS) {
    if (onlyPresent && src[f] === undefined) continue;
    let v = src[f];
    if (typeof v === 'string') v = v.trim();
    if (f === 'license_categories') v = (v || []).map((c: string) => String(c).toUpperCase());
    if (f === 'skills' && Array.isArray(v)) v = [...new Set(v)];
    if (f === 'vehicle' && v && typeof v === 'object') v = { ...v };
    if (f === 'regions' && Array.isArray(v)) {
      v = v.map((r: any) => ({ region_code: r.region_code, ...(r.district_code ? { district_code: r.district_code } : {}) }));
    }
    out[f] = v === '' ? null : v ?? (f === 'license_categories' ? [] : null);
  }
  return out;
}

/** Superadmin ko'rinishi: parol xeshi va holat tokeni YO'Q. */
function adminView(a: CourierApplication, documentsCount: number) {
  const plain: any = { ...a.get({ plain: true }) };
  delete plain.password_hash;
  delete plain.public_token_hash;
  delete plain.push_token;
  plain.documents_count = documentsCount;
  const bd = new Date(`${a.birth_date}T00:00:00Z`);
  plain.age = Number.isNaN(bd.getTime()) ? null : Math.floor((Date.now() - bd.getTime()) / (365.25 * 24 * 3600 * 1000));
  plain.login = normalizePhoneDigits(a.phone);
  return plain;
}

function hmac(payload: string): string {
  const secret =
    process.env.DOCUMENT_URL_SECRET ||
    createHash('sha256').update(`courier-app-docs:${process.env.ACCESS_TOKEN_KEY || ''}`).digest('hex');
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeName(name: string): string {
  let decoded = name || 'hujjat';
  try {
    decoded = Buffer.from(decoded, 'latin1').toString('utf8');
  } catch {
    /* asl holicha */
  }
  return decoded.replace(/[\\/]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200) || 'hujjat';
}
