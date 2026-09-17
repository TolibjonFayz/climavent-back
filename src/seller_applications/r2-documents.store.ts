import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * Ariza hujjatlarini R2 da YOPIQ bucket'da saqlash (topshiriq №20, 1-band).
 *
 * MAVJUD R2 bucket'idan farqi: u OMMAVIY (`R2_PUBLIC_URL` orqali har bir
 * obyekt havola bilan ochiladi). Guvohnoma va pasport nusxasi u yerga
 * qo'yilmaydi. Bu yerda alohida bucket ishlatiladi va unda ommaviy kirish
 * YOQILMAGAN bo'lishi shart — fayl faqat server orqali beriladi.
 *
 * Kalit taxmin qilib bo'lmaydigan: `seller-docs/<uuid>`. Lekin kalit sir
 * emas, himoya kalitning o'zida emas: bucket yopiq, fayl esa 5 daqiqalik
 * imzolangan havola orqali SERVER tomonidan uzatiladi (presigned R2 URL
 * ishlatilmaydi — bucket manzili tashqariga umuman chiqmaydi).
 *
 * Sozlanmagan bo'lsa (`R2_DOCS_BUCKET` yo'q) — `enabled === false` va
 * hujjatlar avvalgidek bazada saqlanadi.
 */
@Injectable()
export class R2DocumentsStore {
  private readonly logger = new Logger(R2DocumentsStore.name);
  private client: S3Client | null = null;
  private bucket: string | null = null;

  constructor(config: ConfigService) {
    const bucket = config.get<string>('R2_DOCS_BUCKET');
    const accountId = config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');
    if (!bucket || !accountId || !accessKeyId || !secretAccessKey) return;

    this.bucket = bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
    this.logger.log(`Ariza hujjatlari R2 bucket'ida: ${bucket}`);
  }

  get enabled(): boolean {
    return !!this.client && !!this.bucket;
  }

  newKey(): string {
    return `seller-docs/${randomUUID()}`;
  }

  /**
   * Yozadi va DARHOL QAYTA O'QIB tekshiradi.
   *
   * Nega: R2 ga jimgina bo'sh obyekt yozilib ketishi mumkin (mahsulot
   * tavsiflarida aynan shu bo'lgan — 40 dan ortiq bo'sh fayl). Hujjat
   * yo'qolganini oylar o'tib, tekshiruv paytida bilish mumkin emas:
   * yuklash xato bilan tugagani yaxshiroq.
   */
  async put(key: string, body: Buffer, mime: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mime,
        // Yopiq fayl hech qayerda keshlanmasin
        CacheControl: 'no-store',
      }),
    );
    const back = await this.get(key);
    if (!back || back.length !== body.length) {
      throw new Error(
        `R2 tekshiruvi yiqildi (${key}): yozildi ${body.length} bayt, o'qildi ${back?.length ?? 0}`,
      );
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await res.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (e: any) {
      if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (e) {
      // O'chirilmagan fayl qolib ketishi mumkin — jurnalda ko'rinadi.
      this.logger.error(`R2 dan o'chirib bo'lmadi (${key}): ${(e as Error).message}`);
    }
  }
}
