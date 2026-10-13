import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { randomUUID } from 'crypto';
import { QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import sharp = require('sharp');
import { R2DocumentsStore } from 'src/seller_applications/r2-documents.store';
import {
  AttachmentKind,
  BLOCKED_EXT,
  CHAT_FILE_MAX_BYTES,
  FileVariant,
  THUMB_MAX_PX,
  cleanFileName,
  extOf,
  fileToken,
  sniff,
  withExt,
} from './chat-files';

// heic-convert — CommonJS, tiplari yo'q. libheif (JS) — HEVC dekoderi bor,
// sharp'ning tayyor libvips'ida esa faqat AV1 (AVIF).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const heicConvert: (o: { buffer: Buffer; format: 'JPEG'; quality: number }) => Promise<ArrayBuffer> = require('heic-convert');

// sharp <0.35 libvips'idagi zaifliklar shu yuklovchilarda (GHSA-f88m-g3jw-g9cj).
// Bizga kerak emas: GIF o'lchami qo'lda o'qiladi, TIFF — oddiy fayl.
sharp.block({ operation: ['VipsForeignLoadNsgif', 'VipsForeignLoadTiff', 'VipsForeignLoadVips'] });

/** Bitta foydalanuvchiga: daqiqasiga 20 ta yuklash, 24 soatda 500 MB (№46, 1-band). */
const UPLOADS_PER_MIN = Number(process.env.CHAT_UPLOAD_RATE_LIMIT) || 20;
const BYTES_PER_DAY = Number(process.env.CHAT_UPLOAD_DAILY_BYTES) || 500 * 1024 * 1024;
const ORPHAN_TTL_HOURS = 24;
/** Dekompressiya bombasidan himoya: 100 Mpx dan katta rasm qayta ishlanmaydi. */
const MAX_PIXELS = 100_000_000;

type Side = 'client' | 'store';

export interface AttachmentView {
  id: number;
  kind: AttachmentKind;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  url: string;
  thumb_url: string | null;
}

interface Prepared {
  kind: AttachmentKind;
  name: string;
  mime: string;
  data: Buffer;
  width: number | null;
  height: number | null;
  thumb: Buffer | null;
}

const ROW_COLUMNS = 'a.id, a.message_id, a.kind, a.name, a.mime, a.size, a.width, a.height, a.has_thumb';

/**
 * Chat fayllari (topshiriq №46): qabul, tekshiruv, rasmni tozalash, saqlash
 * va imzoli havola orqali berish. Huquq (kim qaysi suhbatga) — `ChatsService`
 * da, bu yerga a'zoligi tekshirilgan so'rov keladi.
 */
@Injectable()
export class ChatFilesService {
  private readonly logger = new Logger('ChatFiles');
  private readonly uploads = new Map<string, number[]>();

  constructor(
    @InjectConnection() private readonly db: Sequelize,
    private readonly r2: R2DocumentsStore,
  ) {}

  get storage(): 'r2' | 'db' {
    return this.r2.enabled ? 'r2' : 'db';
  }

  // ------------------------------------------------------------ yuklash
  async upload(chatId: number, side: Side, userId: number, file: Express.Multer.File | undefined, base: string) {
    if (!file?.buffer) throw new BadRequestException("Fayl yo'q — multipart maydoni `file`");
    if (file.size > CHAT_FILE_MAX_BYTES || file.buffer.length > CHAT_FILE_MAX_BYTES) {
      throw new PayloadTooLargeException({ statusCode: 413, message: 'Fayl 25 MB dan katta' });
    }
    if (!file.buffer.length) throw new BadRequestException("Fayl bo'sh");
    const name = cleanFileName(file.originalname);
    const ext = extOf(name);
    const sniffed = sniff(file.buffer, ext);
    if (BLOCKED_EXT.has(ext) || sniffed.executable) {
      throw new UnsupportedMediaTypeException({ statusCode: 415, message: "Bu turdagi fayllarni yuborib bo'lmaydi" });
    }
    await this.rateLimit(side, userId, file.buffer.length);

    const prepared = await this.prepare(file.buffer, name, sniffed.kind, sniffed.mime);
    const id = await this.save(chatId, side, userId, prepared);
    const [row]: any[] = await this.db.query(`SELECT ${ROW_COLUMNS} FROM chat_attachments a WHERE a.id = :id`, {
      replacements: { id },
      type: QueryTypes.SELECT,
    });
    return this.view(row, base);
  }

  /** Rasm: EXIF (GPS) olib tashlanadi, burilish qo'llanadi, HEIC → JPEG, eskiz ≤ 480 px. */
  private async prepare(buf: Buffer, name: string, kind: AttachmentKind, mime: string): Promise<Prepared> {
    const plain: Prepared = { kind, name, mime, data: buf, width: null, height: null, thumb: null };
    if (kind !== 'image') return plain;

    try {
      if (mime === 'image/gif') {
        // GIF yuklovchisi bloklangan (yuqoriga qarang) — o'lcham sarlavhadan, eskizsiz
        return { ...plain, width: buf.readUInt16LE(6) || null, height: buf.readUInt16LE(8) || null };
      }
      let src = buf;
      let outName = name;
      let outMime = mime;
      if (mime === 'image/heic' || mime === 'image/heif') {
        src = Buffer.from(await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.9 }));
        outName = withExt(name, 'jpg');
        outMime = 'image/jpeg';
      }
      const img = () => sharp(src, { limitInputPixels: MAX_PIXELS, failOn: 'error' });
      let data: Buffer;
      if (outMime === 'image/avif') {
        // AVIF qayta kodlash juda sekin — asl fayl qoladi (telefonlar EXIF'ni AVIF ga deyarli yozmaydi)
        data = src;
      } else {
        // sharp metama'lumotni (EXIF, GPS, XMP) standart bo'yicha YOZMAYDI; rotate() — EXIF burilishi
        const pipe = img().rotate();
        data =
          outMime === 'image/png'
            ? await pipe.png({ compressionLevel: 8 }).toBuffer()
            : outMime === 'image/webp'
              ? await pipe.webp({ quality: 90 }).toBuffer()
              : await pipe.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
      }
      const meta = await sharp(data, { limitInputPixels: MAX_PIXELS }).metadata();
      const thumb = await sharp(data, { limitInputPixels: MAX_PIXELS })
        .rotate()
        .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 72 })
        .toBuffer();
      const turned = (meta.orientation ?? 1) >= 5; // AVIF'da burilish metama'lumotda qolishi mumkin
      return {
        kind: 'image',
        name: outName,
        mime: outMime,
        data,
        width: (turned ? meta.height : meta.width) ?? null,
        height: (turned ? meta.width : meta.height) ?? null,
        thumb,
      };
    } catch (e) {
      // Buzilgan yoki ochib bo'lmaydigan rasm — oddiy fayl sifatida (yuklab olinadi, brauzerda ochilmaydi)
      this.logger.warn(`Rasmni qayta ishlab bo'lmadi (${mime}): ${(e as Error).message}`);
      return { ...plain, kind: 'file' };
    }
  }

  private async save(chatId: number, side: Side, userId: number, p: Prepared): Promise<number> {
    const base = {
      chat: chatId,
      side,
      uid: userId,
      kind: p.kind,
      name: p.name,
      mime: p.mime,
      size: p.data.length,
      w: p.width,
      h: p.height,
      thumb: !!p.thumb,
    };
    if (this.storage === 'r2') {
      const key = `chat/${chatId}/${randomUUID()}`;
      const thumbKey = p.thumb ? `${key}-t` : null;
      await this.r2.putChecked(key, p.data, p.mime);
      try {
        if (thumbKey) await this.r2.putChecked(thumbKey, p.thumb, 'image/webp');
        const [row]: any[] = await this.db.query(
          `INSERT INTO chat_attachments (chat_id, uploader_side, uploader_user_id, kind, name, mime, size, width, height,
                                         storage, file_key, thumb_key, has_thumb)
           VALUES (:chat, :side, :uid, :kind, :name, :mime, :size, :w, :h, 'r2', :key, :tkey, :thumb) RETURNING id`,
          { replacements: { ...base, key, tkey: thumbKey }, type: QueryTypes.SELECT },
        );
        return Number(row.id);
      } catch (e) {
        await this.r2.remove(key);
        if (thumbKey) await this.r2.remove(thumbKey);
        throw e;
      }
    }
    return this.db.transaction(async (t) => {
      const [row]: any[] = await this.db.query(
        `INSERT INTO chat_attachments (chat_id, uploader_side, uploader_user_id, kind, name, mime, size, width, height,
                                       storage, has_thumb)
         VALUES (:chat, :side, :uid, :kind, :name, :mime, :size, :w, :h, 'db', :thumb) RETURNING id`,
        { replacements: base, type: QueryTypes.SELECT, transaction: t },
      );
      const id = Number(row.id);
      // `bind` — bayt massivi ikkilik parametr bo'lib ketadi (25 MB SQL matniga aylanmaydi)
      const blob = (variant: FileVariant, data: Buffer) =>
        this.db.query('INSERT INTO chat_attachment_blobs (attachment_id, variant, data) VALUES ($1, $2, $3)', {
          bind: [id, variant, data],
          transaction: t,
        });
      await blob('file', p.data);
      if (p.thumb) await blob('thumb', p.thumb);
      return id;
    });
  }

  private async rateLimit(side: Side, userId: number, size: number) {
    const key = `${side}${userId}`;
    const now = Date.now();
    const recent = (this.uploads.get(key) || []).filter((t) => now - t < 60_000);
    if (recent.length >= UPLOADS_PER_MIN) {
      throw new HttpException(
        { statusCode: 429, message: "Juda ko'p fayl — bir daqiqadan keyin qayta urinib ko'ring" },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const [row]: any[] = await this.db.query(
      `SELECT COALESCE(SUM(size), 0)::bigint AS total FROM chat_attachments
        WHERE uploader_side = :side AND uploader_user_id = :uid AND created_at > now() - interval '24 hours'`,
      { replacements: { side, uid: userId }, type: QueryTypes.SELECT },
    );
    if (Number(row.total) + size > BYTES_PER_DAY) {
      throw new HttpException(
        { statusCode: 429, message: 'Kunlik chegara (500 MB) tugadi — ertaga qayta urinib ko\'ring' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.uploads.set(key, recent);
    if (this.uploads.size > 5000) {
      for (const [k, v] of this.uploads) if (!v.some((t) => now - t < 60_000)) this.uploads.delete(k);
    }
  }

  // ------------------------------------------------------------ xabarga bog'lash
  /**
   * Fayllarni xabarga bog'laydi. Har biri shu suhbatga, shu foydalanuvchi
   * yuklagan va hali bog'lanmagan bo'lishi shart — aks holda 400 (tranzaksiya
   * bekor bo'ladi, xabar ham yozilmaydi).
   */
  async link(t: Transaction, ids: number[], chatId: number, side: Side, userId: number, messageId: number) {
    if (!ids.length) return;
    const rows: any[] = await this.db.query(
      `UPDATE chat_attachments SET message_id = :msg
        WHERE id IN (:ids) AND chat_id = :chat AND uploader_side = :side AND uploader_user_id = :uid
          AND message_id IS NULL
        RETURNING id`,
      { replacements: { msg: messageId, ids, chat: chatId, side, uid: userId }, type: QueryTypes.SELECT, transaction: t },
    );
    if (rows.length !== ids.length) {
      throw new BadRequestException(
        "attachment_ids: fayl topilmadi, boshqa suhbatga yoki boshqa foydalanuvchiga tegishli, yoki allaqachon yuborilgan",
      );
    }
  }

  /** Xabarlar fayllari: `message_id → [...]`, yuklash tartibida. */
  async forMessages(messageIds: number[], base: string): Promise<Map<number, AttachmentView[]>> {
    const out = new Map<number, AttachmentView[]>();
    if (!messageIds.length) return out;
    const rows: any[] = await this.db.query(
      `SELECT ${ROW_COLUMNS} FROM chat_attachments a WHERE a.message_id IN (:ids) ORDER BY a.id`,
      { replacements: { ids: messageIds }, type: QueryTypes.SELECT },
    );
    for (const r of rows) {
      const list = out.get(Number(r.message_id)) || [];
      list.push(this.view(r, base));
      out.set(Number(r.message_id), list);
    }
    return out;
  }

  private view(r: any, base: string): AttachmentView {
    const id = Number(r.id);
    const path = (v: FileVariant) => `${base}/api/chats/files/${fileToken(id, v)}`;
    return {
      id,
      kind: r.kind,
      name: r.name,
      mime: r.mime,
      size: Number(r.size),
      width: r.width === null ? null : Number(r.width),
      height: r.height === null ? null : Number(r.height),
      // Nom havola oxirida ham — ilovalar saqlashda fayl nomini shundan oladi
      url: `${path('file')}/${encodeURIComponent(r.name)}`,
      thumb_url: r.has_thumb ? path('thumb') : null,
    };
  }

  // ------------------------------------------------------------ berish
  async meta(id: number) {
    const [row]: any[] = await this.db.query(
      `SELECT id, kind, name, mime, size, storage, file_key, thumb_key, has_thumb FROM chat_attachments WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    return row ?? null;
  }

  /** Bazadagi fayl (R2 sozlanmagan bo'lsa). */
  async blob(id: number, variant: FileVariant): Promise<Buffer | null> {
    const [row]: any[] = await this.db.query(
      'SELECT data FROM chat_attachment_blobs WHERE attachment_id = :id AND variant = :v',
      { replacements: { id, v: variant }, type: QueryTypes.SELECT },
    );
    return row?.data ?? null;
  }

  openR2(key: string, range?: string) {
    return this.r2.open(key, range);
  }

  // ------------------------------------------------------------ tozalash
  /** 24 soat ichida xabarga bog'lanmagan fayllar (fon ishi). */
  async sweepOrphans(): Promise<number> {
    const rows: any[] = await this.db.query(
      `SELECT id, storage, file_key, thumb_key FROM chat_attachments
        WHERE message_id IS NULL AND created_at < now() - interval '${ORPHAN_TTL_HOURS} hours'
        ORDER BY id LIMIT 500`,
      { type: QueryTypes.SELECT },
    );
    if (!rows.length) return 0;
    await this.removeR2(rows);
    await this.db.query('DELETE FROM chat_attachments WHERE id IN (:ids) AND message_id IS NULL', {
      replacements: { ids: rows.map((r) => Number(r.id)) },
    });
    return rows.length;
  }

  /** R2 obyektlari (yozuv o'chirilishidan OLDIN chaqiriladi). */
  async removeR2(rows: { storage: string; file_key: string | null; thumb_key: string | null }[]) {
    if (!this.r2.enabled) return;
    for (const r of rows) {
      if (r.storage !== 'r2') continue;
      if (r.file_key) await this.r2.remove(r.file_key);
      if (r.thumb_key) await this.r2.remove(r.thumb_key);
    }
  }
}
