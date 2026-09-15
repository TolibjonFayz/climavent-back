import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { OfferVersion } from './model/offer-version.model';
import { OfferAcceptance } from './model/offer-acceptance.model';

export type OfferKind = 'seller' | 'buyer' | 'privacy';

const LABELS: Record<OfferKind, string> = {
  seller: 'Sotuvchilar uchun oferta',
  buyer: 'Foydalanish shartlari',
  privacy: 'Maxfiylik siyosati',
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
