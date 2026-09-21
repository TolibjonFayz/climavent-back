import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Op } from 'sequelize';
import type { StoreRequester } from 'src/store_auth/store_auth.guard';
import {
  COURIER_DOC_MAX_BYTES,
  COURIER_DOC_URL_TTL_MS,
  COURIER_DOCUMENT_TYPES,
  COURIER_PASSPORT_RETENTION_DAYS,
  CourierDocumentType,
  requiredCourierDocuments,
} from './constants';
import { Courier, CourierDocument, CourierDocumentBlob, CourierVehicle } from './model/models';

// Tur mijoz aytgan `mimetype` bo'yicha emas, faylning O'Z IMZOSI bo'yicha
// aniqlanadi (№16, 2-band bilan bir xil qoida).
const ALLOWED = [
  {
    mime: 'application/pdf',
    test: (b: Buffer) => b.length > 5 && b.subarray(0, 5).toString('ascii') === '%PDF-',
  },
  {
    mime: 'image/jpeg',
    test: (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    test: (b: Buffer) =>
      b.length > 8 &&
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
];

/**
 * Kuryer hujjatlari (topshiriq №26, 1-band).
 *
 * Sotuvchi hujjatlari bilan AYNAN bir xil qoida (№16, 2-band): baytlar
 * ochiq R2 bucket'ida emas, BAZADA; faylga faqat server imzolagan
 * 5 daqiqalik havola orqali kiriladi — havola guvohnomasiz ochiladi
 * (brauzer yangi oynada sarlavha yubora olmaydi), lekin uni faqat
 * huquqi bor hisob OLA oladi.
 *
 * Pasport skani kuryer ishdan ketgandan 30 kun keyin o'chiriladi;
 * metama'lumot (kim, qachon yukladi) qoladi.
 */
@Injectable()
export class CourierDocumentsService {
  async list(courier: Courier) {
    const docs = await CourierDocument.findAll({
      where: { courier_id: courier.id },
      order: [['id', 'ASC']],
    });
    const required = requiredCourierDocuments({
      vehicle_type: courier.vehicle_type,
      employment_type: courier.employment_type,
    });
    const have = new Set(docs.filter((d) => !d.deleted_at).map((d) => d.type));
    return {
      documents: docs.map((d) => ({
        id: d.id,
        type: d.type,
        vehicle_id: d.vehicle_id,
        original_name: d.original_name,
        mime: d.mime,
        size: d.size,
        deleted_at: d.deleted_at,
        created_at: d.created_at,
      })),
      required,
      missing: required.filter((t) => !have.has(t)),
      verified_at: courier.documents_verified_at,
      verified_by: courier.verified_by,
    };
  }

  async store(
    courier: Courier,
    type: string,
    file: Express.Multer.File | undefined,
    r: StoreRequester,
    vehicleId?: number | null,
  ) {
    if (!(COURIER_DOCUMENT_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException(`type: ${COURIER_DOCUMENT_TYPES.join(', ')}`);
    }
    if (!file || !file.buffer?.length) throw new BadRequestException('Fayl yuborilmadi');
    if (file.size > COURIER_DOC_MAX_BYTES) {
      throw new BadRequestException("Fayl 10 MB dan katta bo'lmasin");
    }
    const detected = ALLOWED.find((t) => t.test(file.buffer));
    if (!detected) throw new BadRequestException('Faqat PDF, JPG yoki PNG yuklash mumkin');

    if (vehicleId) {
      const v = await CourierVehicle.findOne({ where: { id: vehicleId, courier_id: courier.id } });
      if (!v) throw new BadRequestException('vehicle_id bu kuryerga tegishli emas');
    }
    if (type === 'vehicle_registration' && !vehicleId) {
      throw new BadRequestException('Texpasport uchun vehicle_id majburiy');
    }

    return CourierDocument.sequelize.transaction(async (transaction) => {
      const doc = await CourierDocument.create(
        {
          courier_id: courier.id,
          vehicle_id: vehicleId ?? null,
          type,
          storage: 'db',
          file_key: randomBytes(24).toString('hex'),
          original_name: this.safeName(file.originalname),
          mime: detected.mime,
          size: file.size,
          uploaded_by: r?.user_id ?? null,
        } as any,
        { transaction },
      );
      await CourierDocumentBlob.create({ document_id: doc.id, data: file.buffer } as any, { transaction });
      return { id: doc.id, type: doc.type, original_name: doc.original_name, size: doc.size, vehicle_id: doc.vehicle_id };
    });
  }

  /** 5 daqiqalik imzolangan havola. */
  signUrl(courier: Courier, docId: number) {
    return CourierDocument.findOne({ where: { id: docId, courier_id: courier.id } }).then((doc) => {
      if (!doc) throw new NotFoundException('Hujjat topilmadi');
      if (doc.deleted_at) throw new GoneException("Hujjat saqlash muddati tugab o'chirilgan");
      const expiresAt = new Date(Date.now() + COURIER_DOC_URL_TTL_MS);
      const payload = Buffer.from(`${doc.id}.${expiresAt.getTime()}`).toString('base64url');
      return {
        url: `/api/courier-documents/file/${payload}.${this.hmac(payload)}`,
        expires_at: expiresAt,
      };
    });
  }

  /** Imzoni va muddatni tekshirib, faylni qaytaradi (guvohnomasiz ochiladi). */
  async openSigned(token: string) {
    const [payload, signature] = String(token || '').split('.');
    if (!payload || !signature) throw new NotFoundException("Havola noto'g'ri");
    const expected = Buffer.from(this.hmac(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new NotFoundException("Havola noto'g'ri");
    }
    const [idStr, expStr] = Buffer.from(payload, 'base64url').toString().split('.');
    if (!(Number(expStr) > Date.now())) {
      throw new GoneException("Havola muddati o'tgan — adminkadan qayta oling");
    }
    const doc = await CourierDocument.findByPk(Number(idStr));
    if (!doc) throw new NotFoundException('Hujjat topilmadi');
    if (doc.deleted_at) throw new GoneException("Hujjat saqlash muddati tugab o'chirilgan");
    const blob = await CourierDocumentBlob.findByPk(doc.id);
    if (!blob) throw new GoneException("Hujjat o'chirilgan");
    return { doc, data: blob.data };
  }

  /** Hujjatlar tasdiqlandi — shundan keyin kuryerni biriktirish mumkin. */
  async verify(courier: Courier, r: StoreRequester) {
    const { missing } = await this.list(courier);
    if (missing.length) {
      throw new ConflictException(`Majburiy hujjatlar yuklanmagan: ${missing.join(', ')}`);
    }
    await courier.update({ documents_verified_at: new Date(), verified_by: r?.user_id ?? null });
    return { verified_at: courier.documents_verified_at, verified_by: courier.verified_by };
  }

  /** Tasdiqni olib tashlash (hujjat eskirgan yoki soxta bo'lsa). */
  async unverify(courier: Courier) {
    await courier.update({ documents_verified_at: null, verified_by: null });
    return { verified_at: null };
  }

  /**
   * Nofaol kuryerlarning pasport skanlarini o'chirish (fon ishi).
   * №16 dagi qoida: yakuniy qarordan 30 kun. Metama'lumot qoladi.
   */
  async purgeOldPassports(): Promise<number> {
    const cutoff = new Date(Date.now() - COURIER_PASSPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const docs = await CourierDocument.findAll({
      where: { type: 'passport', deleted_at: null },
      include: [],
    });
    if (!docs.length) return 0;
    const inactive = await Courier.findAll({
      where: {
        id: { [Op.in]: docs.map((d) => d.courier_id) },
        is_active: false,
        updated_at: { [Op.lt]: cutoff },
      },
      attributes: ['id'],
    });
    const ids = new Set(inactive.map((c) => c.id));
    const targets = docs.filter((d) => ids.has(d.courier_id));
    for (const doc of targets) {
      await CourierDocument.sequelize.transaction(async (transaction) => {
        await CourierDocumentBlob.destroy({ where: { document_id: doc.id }, transaction });
        await doc.update({ deleted_at: new Date() }, { transaction });
      });
    }
    return targets.length;
  }

  private hmac(payload: string): string {
    const secret =
      process.env.DOCUMENT_URL_SECRET ||
      createHash('sha256').update(`courier-docs:${process.env.ACCESS_TOKEN_KEY || ''}`).digest('hex');
    return createHmac('sha256', secret).update(payload).digest('base64url');
  }

  // Multer nomni latin1 deb o'qiydi — kirill/o'zbek nomlar buzilmasin.
  private safeName(name: string): string {
    let decoded = name || 'hujjat';
    try {
      decoded = Buffer.from(decoded, 'latin1').toString('utf8');
    } catch {
      /* asl holicha */
    }
    return (
      decoded
        .replace(/[\\/]/g, '_')
        .replace(/[ -]/g, '')
        .trim()
        .slice(0, 200) || 'hujjat'
    );
  }
}

export type { CourierDocumentType };
