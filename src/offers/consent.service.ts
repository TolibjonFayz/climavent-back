import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Op } from 'sequelize';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { OfferVersion } from './model/offer-version.model';
import { OfferAcceptance } from './model/offer-acceptance.model';

export type OfferKind = 'seller' | 'buyer' | 'privacy' | 'courier';

const LABELS: Record<OfferKind, string> = {
  seller: 'Sotuvchilar uchun oferta',
  buyer: 'Foydalanish shartlari',
  privacy: 'Maxfiylik siyosati',
  // Topshiriq №26, 1-band: sotuvchi ofertasi mexanizmi kuryer uchun takrorlanadi
  courier: 'Kuryerlar uchun oferta',
};

export interface AcceptanceInput {
  kind: OfferKind;
  version: string;
  user_id?: number | null;
  application_id?: number | null;
  store_id?: number | null;
  store_user_id?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  accepted_at?: Date;
}

/**
 * Hujjat versiyalari va rozilik DALILI (topshiriq №16, 3-band; №18).
 *
 * `offer_acceptances` ga faqat qo'shiladi — baza trigger'i o'zgartirish va
 * o'chirishni taqiqlaydi. Qaysi versiya, qachon, qaysi hisob va IP dan
 * qabul qilingani shartnoma tuzilganining dalili (oferta 3.6).
 */
@Injectable()
export class ConsentService {
  constructor(
    @InjectModel(OfferVersion) private readonly offerRepo: typeof OfferVersion,
    @InjectModel(OfferAcceptance) private readonly acceptanceRepo: typeof OfferAcceptance,
  ) {}

  current(kind: OfferKind) {
    return this.offerRepo.findOne({ where: { kind, is_current: true } });
  }

  async currentPublic(kind: OfferKind) {
    const offer = await this.current(kind);
    return offer
      ? { version: offer.version, url: offer.url, effective_at: new Date(offer.effective_at).toISOString() }
      : null;
  }

  /** Yuborilgan versiya joriy emasmi — 409 (sahifa ochiq qolib ketgan paytda hujjat yangilangan). */
  async assertCurrent(kind: OfferKind, version: string) {
    const offer = await this.current(kind);
    if (!offer) throw new ServiceUnavailableException(`${LABELS[kind]} e'lon qilinmagan`);
    if (offer.version !== version) {
      throw new ConflictException(
        `${LABELS[kind]} yangilangan (joriy versiya ${offer.version}) — sahifani yangilab, qayta tanishib chiqing`,
      );
    }
    return offer;
  }

  /**
   * Shu hisob shu hujjatning JORIY versiyasini qabul qilganmi (topshiriq №20, 2-band).
   *
   * Sotuvchi hisobi uchun dalil uch xil bog'lanish bilan yozilgan bo'lishi
   * mumkin: hisobning o'zi (`store_user_id`), do'kon (`store_id`) yoki ariza
   * (`application_id`, ariza tasdiqlanishidan oldin). Birinchi ikkitasi
   * hisobning O'ZI tasdiqlagani demak — ariza dalili boshqa odam (ariza
   * topshirgan kishi) tomonidan yozilgan bo'lishi mumkin, shuning uchun u
   * kabinetga kirish uchun yetarli deb hisoblanmaydi.
   */
  async storeUserAccepted(kind: OfferKind, version: string, storeUserId: number, storeId?: number | null) {
    const or: any[] = [{ store_user_id: storeUserId }];
    if (storeId) or.push({ store_id: storeId });
    const row = await this.acceptanceRepo.findOne({
      where: { kind, version, [Op.or]: or },
      attributes: ['id'],
    });
    return !!row;
  }

  /**
   * Kabinetga kirishda tasdiqlanishi kerak bo'lgan hujjat (yoki `null`).
   * Superadmin — sotuvchi ham, kuryer ham emas: undan oferta so'ralmaydi.
   *
   * `kind` — hisob roliga qarab: sotuvchi `seller`, kuryer `courier`
   * (topshiriq №26, 1-band).
   */
  async pendingForStoreUser(storeUserId: number, storeId: number | null, kind: OfferKind = 'seller') {
    const offer = await this.current(kind);
    if (!offer) return null;
    const accepted = await this.storeUserAccepted(kind, offer.version, storeUserId, storeId);
    if (accepted) return null;
    return { kind, version: offer.version, url: offer.url };
  }

  /**
   * Xaridor uchun: qabul qilgan versiyasi eskirgan hujjatlar (topshiriq №20, 2-band).
   * Ikkalasi ham joyida bo'lsa — `null`.
   */
  async pendingForUser(userId: number) {
    const [buyer, privacy] = await Promise.all([this.current('buyer'), this.current('privacy')]);
    if (!buyer || !privacy) return null;

    const rows = await this.acceptanceRepo.findAll({
      where: {
        user_id: userId,
        [Op.or]: [
          { kind: 'buyer', version: buyer.version },
          { kind: 'privacy', version: privacy.version },
        ],
      },
      attributes: ['kind'],
    });
    const bor = new Set(rows.map((r) => r.kind));
    if (bor.has('buyer') && bor.has('privacy')) return null;

    return {
      terms: { version: buyer.version, url: buyer.url, effective_at: new Date(buyer.effective_at).toISOString() },
      privacy: { version: privacy.version, url: privacy.url, effective_at: new Date(privacy.effective_at).toISOString() },
    };
  }

  /**
   * Rozilik yozuvlari ro'yxati (topshiriq №19, 6-band) — nizo chiqqanda dalil.
   * Faqat O'QISH: jadval trigger bilan himoyalangan, o'zgartirib bo'lmaydi.
   */
  async list(q: {
    kind?: string;
    user_id?: number;
    store_id?: number;
    store_user_id?: number;
    application_id?: number;
    version?: string;
    page?: number;
    limit?: number;
  }) {
    const limit = Math.min(q.limit || 50, 200);
    const page = Math.max(q.page || 1, 1);
    const where: any = {};
    for (const [k, v] of Object.entries({
      kind: q.kind,
      version: q.version,
      user_id: q.user_id,
      store_id: q.store_id,
      store_user_id: q.store_user_id,
      application_id: q.application_id,
    })) {
      if (v !== undefined && v !== null && v !== '') where[k] = v;
    }
    const { rows, count } = await this.acceptanceRepo.findAndCountAll({
      where,
      order: [['accepted_at', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    return { rows, total: count, page, limit };
  }

  /**
   * Rozilikni yozadi. Shu foydalanuvchi shu hujjatning shu versiyasini
   * allaqachon qabul qilgan bo'lsa — takror yozilmaydi (har kirishda
   * dalil jadvali to'lib ketmasin).
   */
  async record(input: AcceptanceInput, transaction?: Transaction) {
    if (input.user_id) {
      const exists = await this.acceptanceRepo.findOne({
        where: { kind: input.kind, version: input.version, user_id: input.user_id },
        attributes: ['id'],
        transaction,
      });
      if (exists) return exists;
    }
    return this.acceptanceRepo.create(
      {
        kind: input.kind,
        version: input.version,
        user_id: input.user_id ?? null,
        application_id: input.application_id ?? null,
        store_id: input.store_id ?? null,
        store_user_id: input.store_user_id ?? null,
        accepted_at: input.accepted_at ?? new Date(),
        ip: input.ip ?? null,
        user_agent: input.userAgent?.slice(0, 500) ?? null,
      },
      { transaction },
    );
  }
}
