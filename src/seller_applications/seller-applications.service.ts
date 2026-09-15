import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { randomBytes } from 'crypto';
import { Op, Transaction, UniqueConstraintError } from 'sequelize';
import { SellerApplication } from './model/seller-application.model';
import { SellerApplicationEvent } from './model/seller-application-event.model';
import { SellerApplicationDocument } from './model/seller-application-document.model';
import { OfferVersion } from 'src/offers/model/offer-version.model';
import { OfferAcceptance } from 'src/offers/model/offer-acceptance.model';
import { Store } from 'src/stores/model/store.model';
import { StoreRequisites } from 'src/stores/model/store-requisites.model';
import { StoreUser } from 'src/store_users/model/store_user.model';
import { PasswordSetupService, hashToken } from 'src/store_auth/password-setup.service';
import { DocumentStorageService } from './document-storage.service';
import {
  ApproveApplicationDto,
  CreateSellerApplicationDto,
  ResubmitSellerApplicationDto,
} from './dto/seller-application.dto';
import {
  DOCS_PER_APPLICATION,
  FINAL_STATUSES,
  isValidTin,
  ORPHAN_UPLOAD_TTL_MS,
  PASSPORT_RETENTION_DAYS,
  requiredDocuments,
} from './constants';
import { toAdminView, toStatusView } from './seller-applications.serializer';
import { slugify } from 'src/common/helpers/slug';

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Qaror chiqargan hisob. Servis kaliti yoki sotuvchi — ikkalasi ham `null`.
 * Login MATNI ham yoziladi: hisob keyin o'chirilsa `id` NULL bo'ladi, login qoladi.
 */
export interface Actor {
  id: number | null;
  login: string | null;
}
const NO_ACTOR: Actor = { id: null, login: null };

// Ariza maydonlari — DTO dan modelga ko'chiriladiganlari (ochiq ro'yxat).
const FIELDS = [
  'legal_form', 'legal_name', 'tin', 'registered_at', 'legal_address',
  'director_name', 'director_position', 'bank_name', 'bank_account',
  'bank_mfo', 'vat_payer', 'vat_code', 'contact_name', 'contact_phone',
  'contact_email', 'store_name', 'business_type', 'categories', 'brands',
  'warehouse_address', 'delivery_regions', 'comment',
] as const;

@Injectable()
export class SellerApplicationsService {
  private readonly logger = new Logger(SellerApplicationsService.name);

  constructor(
    @InjectModel(SellerApplication) private readonly appRepo: typeof SellerApplication,
    @InjectModel(SellerApplicationEvent) private readonly eventRepo: typeof SellerApplicationEvent,
    @InjectModel(SellerApplicationDocument) private readonly docRepo: typeof SellerApplicationDocument,
    @InjectModel(OfferVersion) private readonly offerRepo: typeof OfferVersion,
    @InjectModel(OfferAcceptance) private readonly acceptanceRepo: typeof OfferAcceptance,
    @InjectModel(Store) private readonly storeRepo: typeof Store,
    @InjectModel(StoreRequisites) private readonly requisitesRepo: typeof StoreRequisites,
    @InjectModel(StoreUser) private readonly storeUserRepo: typeof StoreUser,
    private readonly storage: DocumentStorageService,
    private readonly passwordSetup: PasswordSetupService,
  ) {}

  // ================================================================ OMMAVIY

  async currentOffer(kind: string) {
    const offer = await this.offerRepo.findOne({ where: { kind, is_current: true } });
    if (!offer) throw new NotFoundException('Joriy oferta topilmadi');
    return {
      version: offer.version,
      url: offer.url,
      effective_at: new Date(offer.effective_at).toISOString(),
    };
  }

  async uploadDocument(file: Express.Multer.File, type: string) {
    const doc = await this.storage.store(file, type);
    return { id: doc.id, type: doc.type, original_name: doc.original_name, size: doc.size };
  }

  async create(dto: CreateSellerApplicationDto, ctx: RequestContext) {
    if (dto.offer_accepted !== true) {
      throw new BadRequestException('Ofertani qabul qilish shart');
    }
    const offer = await this.offerRepo.findOne({ where: { kind: 'seller', is_current: true } });
    if (!offer) throw new ServiceUnavailableException('Joriy oferta e\'lon qilinmagan');
    if (dto.offer_version !== offer.version) {
      // Sahifa ochiq qolib ketgan paytda oferta yangilangan
      throw new ConflictException(
        `Oferta yangilangan (joriy versiya ${offer.version}) — sahifani yangilab, qayta tanishib chiqing`,
      );
    }

    const fields = this.pickFields(dto);
    this.validateCrossFields(fields);
    // STIR takrori hujjatlardan OLDIN: aks holda qayta topshirayotgan sotuvchi
    // "hujjat yetishmaydi" (400) ni ko'rib, asl sababni — ariza allaqachon
    // borligini (409) — bilmay qolardi.
    await this.ensureTinFree(fields.tin);

    const docIds = [...new Set(dto.document_ids || [])];
    const docs = await this.loadFreeDocuments(docIds);
    this.ensureRequiredDocuments(fields.legal_form, docs.map((d) => d.type));

    // Formadagi belgi ofertani VA maxfiylik siyosatini qamraydi (№18, 3-band) —
    // joriy maxfiylik versiyasiga ham dalil yoziladi.
    const privacy = await this.offerRepo.findOne({ where: { kind: 'privacy', is_current: true } });

    const rawToken = randomBytes(32).toString('hex');
    try {
      const app = await this.appRepo.sequelize.transaction(async (transaction) => {
        const created = await this.appRepo.create(
          {
            ...fields,
            status: 'pending',
            offer_version: offer.version,
            offer_accepted_at: new Date(),
            offer_ip: ctx.ip ?? null,
            offer_user_agent: ctx.userAgent?.slice(0, 500) ?? null,
            public_token_hash: hashToken(rawToken),
          },
          { transaction },
        );
        await this.linkDocuments(docIds, created.id, transaction);
        await this.event(created.id, 'created', NO_ACTOR, null, transaction);
        // Shartnoma tuzilganining DALILI (oferta 3.6). Baza trigger'i uni
        // o'zgartirish va o'chirishni taqiqlaydi.
        await this.acceptanceRepo.create(
          {
            kind: 'seller',
            version: offer.version,
            application_id: created.id,
            accepted_at: created.offer_accepted_at,
            ip: ctx.ip ?? null,
            user_agent: ctx.userAgent?.slice(0, 500) ?? null,
          },
          { transaction },
        );
        if (privacy) {
          await this.acceptanceRepo.create(
            {
              kind: 'privacy',
              version: privacy.version,
              application_id: created.id,
              accepted_at: created.offer_accepted_at,
              ip: ctx.ip ?? null,
              user_agent: ctx.userAgent?.slice(0, 500) ?? null,
            },
            { transaction },
          );
        }
        return created;
      });
      return { id: app.id, status: app.status, public_token: rawToken };
    } catch (e) {
      // Ikki so'rov bir vaqtda kelsa — bazaning qisman unique indeksi to'xtatadi
      if (e instanceof UniqueConstraintError) {
        throw new ConflictException('Bu STIR bilan ariza allaqachon topshirilgan');
      }
      throw e;
    }
  }

  async getStatus(token: string) {
    const app = await this.findByToken(token);
    return toStatusView(app, await this.linkedTypes(app.id));
  }

  async resubmit(token: string, dto: ResubmitSellerApplicationDto, ctx: RequestContext) {
    const app = await this.findByToken(token);
    if (app.status !== 'needs_info') {
      throw new ConflictException("Arizani faqat ma'lumot so'ralganda to'ldirish mumkin");
    }

    const changes = this.pickFields(dto, true);
    const merged = { ...this.pickFields(app as any), ...changes };
    this.validateCrossFields(merged);
    if (changes.tin && changes.tin !== app.tin) await this.ensureTinFree(changes.tin, app.id);

    // Forma to'liq ro'yxatni (eski + yangi) yuborishi tabiiy — shu arizaga
    // allaqachon bog'langan hujjatlar (o'chirilganlari ham) jimgina tashlab
    // yuboriladi, faqat YANGILARI tekshiriladi va bog'lanadi (№16 tekshiruvi, 1-izoh).
    const own = await this.docRepo.findAll({
      where: { application_id: app.id },
      attributes: ['id', 'type', 'deleted_at'],
    });
    const ownIds = new Set(own.map((d) => d.id));
    const newIds = [...new Set(dto.document_ids || [])].filter((docId) => !ownIds.has(docId));
    const newDocs = await this.loadFreeDocuments(newIds);
    const existing = own.filter((d) => !d.deleted_at);
    if (existing.length + newDocs.length > DOCS_PER_APPLICATION) {
      throw new BadRequestException(`Bitta arizada eng ko'pi ${DOCS_PER_APPLICATION} ta fayl`);
    }
    this.ensureRequiredDocuments(merged.legal_form, [
      ...existing.map((d) => d.type),
      ...newDocs.map((d) => d.type),
    ]);

    const changedNames = Object.keys(changes).filter((k) => String((app as any)[k]) !== String(changes[k]));
    try {
      await this.appRepo.sequelize.transaction(async (transaction) => {
        await app.update({ ...changes, status: 'pending' }, { transaction });
        await this.linkDocuments(newIds, app.id, transaction);
        const parts = [
          changedNames.length ? `o'zgargan maydonlar: ${changedNames.join(', ')}` : null,
          newIds.length ? `yangi hujjatlar: ${newDocs.map((d) => d.type).join(', ')}` : null,
        ].filter(Boolean);
        await this.event(app.id, 'resubmitted', NO_ACTOR, parts.join('; ') || null, transaction);
      });
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        throw new ConflictException('Bu STIR bilan ariza allaqachon topshirilgan');
      }
      throw e;
    }
    void ctx;
    await app.reload();
    return toStatusView(app, await this.linkedTypes(app.id));
  }

  async openDocument(token: string) {
    return this.storage.openSigned(token);
  }

  // ============================================================= SUPERADMIN

  async list(q: { status?: string; page?: number; limit?: number; search?: string }) {
    const limit = Math.min(q.limit || 50, 200);
    const page = q.page || 1;
    const where: any = {};
    if (q.status) where.status = q.status;
    const s = (q.search || '').trim();
    if (s) {
      where[Op.or] = [
        { legal_name: { [Op.iLike]: `%${s}%` } },
        { store_name: { [Op.iLike]: `%${s}%` } },
        { tin: { [Op.iLike]: `%${s}%` } },
        { contact_phone: { [Op.iLike]: `%${s}%` } },
      ];
    }
    const { rows, count } = await this.appRepo.findAndCountAll({
      where,
      include: this.loginIncludes(),
      order: [['created_at', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });
    const counts = await this.documentCounts(rows.map((r) => r.id));
    return {
      rows: rows.map((r) => toAdminView(r, { documentsCount: counts.get(r.id) || 0 })),
      total: count,
    };
  }

  async getOne(id: number) {
    const app = await this.loadFull(id);
    return toAdminView(app, {
      documentsCount: app.documents.filter((d) => !d.deleted_at).length,
      full: true,
    });
  }

  async documentUrl(id: number, docId: number, baseUrl: string) {
    const doc = await this.docRepo.findOne({ where: { id: docId, application_id: id } });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');
    if (doc.deleted_at) throw new GoneException("Hujjat saqlash muddati tugab o'chirilgan");
    const { token, expiresAt } = this.storage.signDownload(doc.id);
    return {
      url: `${baseUrl}/api/seller-applications/documents/file?token=${encodeURIComponent(token)}`,
      expires_at: expiresAt.toISOString(),
    };
  }

  async requestInfo(id: number, message: string, actor: Actor) {
    return this.decide(id, async (app, transaction) => {
      await app.update({ status: 'needs_info', info_request: message.trim() }, { transaction });
      await this.event(app.id, 'info_requested', actor, message.trim(), transaction);
    });
  }

  async reject(id: number, reason: string, actor: Actor) {
    return this.decide(id, async (app, transaction) => {
      await app.update(
        {
          status: 'rejected',
          reject_reason: reason.trim(),
          reviewed_by: actor.id,
          reviewed_by_login: actor.login,
          reviewed_at: new Date(),
        },
        { transaction },
      );
      await this.event(app.id, 'rejected', actor, reason.trim(), transaction);
    });
  }

  async updateNote(id: number, note: string | null, actor: Actor) {
    const app = await this.appRepo.findByPk(id);
    if (!app) throw new NotFoundException('Ariza topilmadi');
    const value = note?.trim() || null;
    await this.appRepo.sequelize.transaction(async (transaction) => {
      await app.update({ admin_note: value }, { transaction });
      await this.event(app.id, 'note', actor, value, transaction);
    });
    return this.getOne(id);
  }

  /**
   * Tasdiqlash — BITTA TRANZAKSIYADA (topshiriq №16, 6-band):
   * do'kon (nofaol) + yopiq rekvizitlar + parolsiz hisob + parol tokeni +
   * ariza holati + tarix. Biror qadam yiqilsa HAMMASI qaytariladi.
   */
  async approve(id: number, dto: ApproveApplicationDto, actor: Actor) {
    try {
      return await this.appRepo.sequelize.transaction(async (transaction) => {
        // Qatorni qulflaymiz: ikki superadmin bir vaqtda bossa ham ikkita
        // do'kon ochilmaydi.
        const app = await this.appRepo.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!app) throw new NotFoundException('Ariza topilmadi');
        if (FINAL_STATUSES.includes(app.status)) {
          throw new ConflictException('Ariza allaqachon yakuniy holatda');
        }

        if (await this.storeUserRepo.findOne({ where: { login: dto.login }, transaction })) {
          throw new ConflictException('Bu login band');
        }
        if (await this.storeRepo.findOne({ where: { tin: app.tin }, transaction })) {
          throw new ConflictException("Bu STIR bilan do'kon allaqachon bor");
        }
        if (await this.storeRepo.findOne({ where: { name: app.store_name }, transaction })) {
          throw new ConflictException("Bu nomli do'kon allaqachon bor");
        }
        const slug = await this.resolveSlug(dto.slug, app.store_name, transaction);

        const store = await this.storeRepo.create(
          {
            name: app.store_name,
            slug,
            is_active: false, // superadmin profil to'ldirilgach faollashtiradi
            phone: app.contact_phone,
            email: app.contact_email,
            legal_name: app.legal_name,
            tin: app.tin,
          } as any,
          { transaction },
        );
        await this.requisitesRepo.create(
          {
            store_id: store.id,
            legal_form: app.legal_form,
            legal_address: app.legal_address,
            director_name: app.director_name,
            bank_name: app.bank_name,
            bank_account: app.bank_account,
            bank_mfo: app.bank_mfo,
            vat_payer: app.vat_payer,
            vat_code: app.vat_code,
            business_type: app.business_type,
            application_id: app.id,
          },
          { transaction },
        );
        const account = await this.storeUserRepo.create(
          {
            store_id: store.id,
            login: dto.login,
            full_name: app.contact_name,
            role: 'store_admin',
            is_active: true,
            password_hash: null, // parolni sotuvchi o'zi o'rnatadi
          } as any,
          { transaction },
        );
        const setup = await this.passwordSetup.issue(account.id, transaction);

        await app.update(
          {
            status: 'approved',
            store_id: store.id,
            store_user_id: account.id,
            store_user_login: account.login,
            reviewed_by: actor.id,
            reviewed_by_login: actor.login,
            reviewed_at: new Date(),
          },
          { transaction },
        );
        await this.event(
          app.id,
          'approved',
          actor,
          `Do'kon #${store.id} (${slug}), login: ${account.login}`,
          transaction,
        );

        return {
          store: { id: store.id, name: store.name, slug: store.slug, is_active: store.is_active },
          store_user: { id: account.id, login: account.login },
          password_setup_token: setup.password_setup_token,
          password_setup_expires_at: setup.expires_at,
        };
      });
    } catch (e) {
      if (e instanceof UniqueConstraintError) {
        // Tekshiruvdan keyin, tranzaksiya ichida band bo'lib qolgan holat
        const fields = Object.keys((e as any).fields || {}).join(',');
        if (fields.includes('login')) throw new ConflictException('Bu login band');
        if (fields.includes('slug')) throw new ConflictException('Bu slug band');
        if (fields.includes('tin')) throw new ConflictException("Bu STIR bilan do'kon allaqachon bor");
        if (fields.includes('name')) throw new ConflictException("Bu nomli do'kon allaqachon bor");
        throw new ConflictException('Takroriy qiymat: ' + fields);
      }
      throw e;
    }
  }

  // ============================================================ FON ISHLARI

  /** Bog'lanmagan eski yuklamalar va muddati o'tgan pasportlar. */
  async runMaintenance() {
    const orphans = await this.storage.purgeOrphans(new Date(Date.now() - ORPHAN_UPLOAD_TTL_MS));

    const cutoff = new Date(Date.now() - PASSPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const apps = await this.appRepo.findAll({
      where: { status: { [Op.in]: FINAL_STATUSES }, reviewed_at: { [Op.lt]: cutoff } },
      attributes: ['id'],
      include: [{
        model: SellerApplicationDocument,
        where: { type: 'passport', deleted_at: null },
        required: true,
        attributes: ['id'],
      }],
    });

    let passports = 0;
    for (const app of apps) {
      await this.appRepo.sequelize.transaction(async (transaction) => {
        for (const doc of app.documents) {
          await this.storage.purgeBlob(doc.id, transaction);
          await this.docRepo.update({ deleted_at: new Date() }, { where: { id: doc.id }, transaction });
        }
        await this.event(
          app.id,
          'documents_purged',
          NO_ACTOR,
          `${app.documents.length} ta pasport fayli saqlash muddati (${PASSPORT_RETENTION_DAYS} kun) tugagani uchun o'chirildi`,
          transaction,
        );
      });
      passports += app.documents.length;
    }
    if (orphans || passports) {
      this.logger.log(`Tozalandi: ${orphans} ta bog'lanmagan yuklama, ${passports} ta pasport`);
    }
    return { orphans, passports };
  }

  // ============================================================ YORDAMCHILAR

  private pickFields(src: any, onlyPresent = false): Record<string, any> {
    const out: Record<string, any> = {};
    for (const f of FIELDS) {
      if (onlyPresent && src[f] === undefined) continue;
      let v = src[f];
      if (typeof v === 'string') v = v.trim();
      out[f] = v === '' ? null : v ?? null;
    }
    return out;
  }

  private validateCrossFields(f: Record<string, any>) {
    if (!isValidTin(f.tin, f.legal_form)) {
      throw new BadRequestException(
        f.legal_form === 'sole_proprietor'
          ? "tin: YaTT uchun 9 raqamli STIR yoki 14 raqamli JShShIR"
          : "tin: 9 raqamli STIR bo'lsin",
      );
    }
    if (f.vat_payer === true && !f.vat_code) {
      throw new BadRequestException("vat_code: QQS to'lovchisi uchun majburiy");
    }
    if (f.registered_at && new Date(f.registered_at).getTime() > Date.now()) {
      throw new BadRequestException("registered_at kelajakdagi sana bo'lmasin");
    }
  }

  /** Arizaga hali bog'lanmagan, o'chirilmagan, 24 soatdan eski bo'lmagan hujjatlar. */
  private async loadFreeDocuments(ids: number[]) {
    if (!ids.length) return [];
    const docs = await this.docRepo.findAll({
      where: {
        id: { [Op.in]: ids },
        application_id: null,
        deleted_at: null,
        created_at: { [Op.gt]: new Date(Date.now() - ORPHAN_UPLOAD_TTL_MS) },
      },
      attributes: ['id', 'type'],
    });
    if (docs.length !== ids.length) {
      throw new BadRequestException(
        "document_ids: hujjat topilmadi, muddati o'tgan yoki boshqa arizaga bog'langan",
      );
    }
    return docs;
  }

  private async linkDocuments(ids: number[], applicationId: number, transaction: Transaction) {
    if (!ids.length) return;
    // `application_id IS NULL` sharti — tekshiruvdan keyin boshqa so'rov
    // o'sha faylni egallab olsa, bu yerda sezamiz.
    const [count] = await this.docRepo.update(
      { application_id: applicationId },
      { where: { id: { [Op.in]: ids }, application_id: null }, transaction },
    );
    if (count !== ids.length) {
      throw new BadRequestException("document_ids: hujjat boshqa arizaga bog'langan");
    }
  }

  private ensureRequiredDocuments(legalForm: string, types: string[]) {
    const missing = requiredDocuments(legalForm).filter((t) => !types.includes(t));
    if (missing.length) {
      throw new BadRequestException(`Majburiy hujjat yetishmaydi: ${missing.join(', ')}`);
    }
  }

  private async ensureTinFree(tin: string, exceptId?: number) {
    const active = await this.appRepo.findOne({
      where: {
        tin,
        status: { [Op.in]: ['pending', 'needs_info', 'approved'] },
        ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}),
      },
      attributes: ['id'],
    });
    if (active) throw new ConflictException('Bu STIR bilan ariza allaqachon topshirilgan');
    if (await this.storeRepo.findOne({ where: { tin }, attributes: ['id'] })) {
      throw new ConflictException("Bu STIR bilan do'kon allaqachon ro'yxatdan o'tgan");
    }
  }

  private async resolveSlug(wanted: string | undefined, name: string, transaction: Transaction) {
    if (wanted) {
      if (await this.storeRepo.findOne({ where: { slug: wanted }, transaction })) {
        throw new ConflictException('Bu slug band');
      }
      return wanted;
    }
    const base = slugify(name);
    for (let i = 1; i < 100; i++) {
      const candidate = i === 1 ? base : `${base}-${i}`;
      if (!(await this.storeRepo.findOne({ where: { slug: candidate }, transaction }))) {
        return candidate;
      }
    }
    return `${base}-${randomBytes(3).toString('hex')}`;
  }

  private async findByToken(token: string) {
    if (typeof token !== 'string' || token.length < 32) {
      throw new NotFoundException('Ariza topilmadi');
    }
    const app = await this.appRepo.findOne({ where: { public_token_hash: hashToken(token) } });
    if (!app) throw new NotFoundException('Ariza topilmadi');
    return app;
  }

  private async linkedTypes(applicationId: number) {
    const docs = await this.docRepo.findAll({
      where: { application_id: applicationId, deleted_at: null },
      attributes: ['type'],
    });
    return docs.map((d) => d.type);
  }

  /** Qaror amallari uchun umumiy qobiq: qulf + yakuniy holat tekshiruvi. */
  private async decide(
    id: number,
    apply: (app: SellerApplication, t: Transaction) => Promise<void>,
  ) {
    await this.appRepo.sequelize.transaction(async (transaction) => {
      const app = await this.appRepo.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!app) throw new NotFoundException('Ariza topilmadi');
      if (FINAL_STATUSES.includes(app.status)) {
        throw new ConflictException('Ariza allaqachon yakuniy holatda');
      }
      await apply(app, transaction);
    });
    return this.getOne(id);
  }

  private loginIncludes() {
    return [
      { model: StoreUser, as: 'reviewer', attributes: ['id', 'login'] },
      { model: StoreUser, as: 'sellerAccount', attributes: ['id', 'login'] },
    ];
  }

  private async loadFull(id: number) {
    const app = await this.appRepo.findByPk(id, {
      include: [
        ...this.loginIncludes(),
        { model: SellerApplicationDocument, required: false },
        {
          model: SellerApplicationEvent,
          required: false,
          include: [{ model: StoreUser, as: 'actor', attributes: ['id', 'login'] }],
        },
      ],
    });
    if (!app) throw new NotFoundException('Ariza topilmadi');
    return app;
  }

  private async documentCounts(ids: number[]) {
    const map = new Map<number, number>();
    if (!ids.length) return map;
    const rows: any[] = await this.docRepo.findAll({
      where: { application_id: { [Op.in]: ids }, deleted_at: null },
      attributes: ['application_id', [this.docRepo.sequelize.fn('COUNT', '*'), 'n']],
      group: ['application_id'],
      raw: true,
    });
    rows.forEach((r) => map.set(Number(r.application_id), Number(r.n)));
    return map;
  }

  private event(
    applicationId: number,
    type: string,
    actor: Actor,
    message: string | null,
    transaction: Transaction,
  ) {
    return this.eventRepo.create(
      { application_id: applicationId, type, actor_id: actor.id, actor_login: actor.login, message },
      { transaction },
    );
  }
}
