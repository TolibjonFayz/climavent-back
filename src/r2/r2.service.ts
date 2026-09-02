import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class R2Service {
  private s3Client: S3Client;
  private bucketName: string;
  private publicUrl: string;

  constructor(private configService: ConfigService) {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.configService.get<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get<string>('R2_SECRET_ACCESS_KEY'),
      },
    });

    this.bucketName = this.configService.get<string>('R2_BUCKET_NAME');
    this.publicUrl = this.configService.get<string>('R2_PUBLIC_URL');
  }

  /**
   * Yangi kontent uchun standart kalit.
   * YAGONA format: `climavent/<uuid>.json`. Eski yozuvlarda kalit prefikssiz
   * va kengaytmasiz (`<uuid>`) — ular o'qishda ishlashda davom etadi,
   * chunki o'qish kalitni shundayligicha uzatadi.
   */
  buildJsonKey(): string {
    return `climavent/${uuidv4()}.json`;
  }

  /**
   * Yozilgan obyektni QAYTA O'QIB tekshiradi.
   * Sabab: ilgari R2 ga jimgina bo'sh `{}` yozilib ketardi va buni hech kim
   * sezmasdi — natijada 40 dan ortiq bo'sh fayl to'plandi. Endi mos
   * kelmasa, yozish XATO bilan tugaydi.
   */
  private async verifyWritten(key: string, expected: string): Promise<void> {
    const response = await this.s3Client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
    );
    const actual = await response.Body.transformToString();
    if (actual !== expected) {
      throw new Error(
        `R2 verification failed for ${key}: ` +
          `yozildi ${expected.length} bayt, o'qildi ${actual.length} bayt`,
      );
    }
  }

  /**
   * JSON yuklash (CREATE).
   * Nima berilsa — O'SHA yoziladi, hech qanday o'ramasiz.
   */
  async uploadJson(key: string, data: any): Promise<string> {
    const body = JSON.stringify(data);
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: body,
          ContentType: 'application/json',
          CacheControl: 'public, max-age=31536000',
        }),
      );
    } catch (error) {
      throw new Error(`R2 upload error: ${error.message}`);
    }
    await this.verifyWritten(key, body);
    return `${this.publicUrl}/${key}`;
  }

  /**
   * Binary fayl (rasm) yuklash.
   * JSON'dan farqi: Body xom Buffer, ContentType esa faylning o'zi.
   * Rasmlar hech qachon o'zgarmaydi (har safar yangi uuid key) — shuning
   * uchun cache bir yillik.
   */
  async uploadFile(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      return `${this.publicUrl}/${key}`;
    } catch (error) {
      throw new Error(`R2 file upload error: ${error.message}`);
    }
  }

  /**
   * JSON yangilash (UPDATE)
   * Bir xil key bilan - overwrite qiladi
   */
  async updateJson(key: string, newData: any): Promise<string> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key, // BIR XIL KEY
          Body: JSON.stringify(newData),
          ContentType: 'application/json',
          CacheControl: 'public, max-age=0, must-revalidate', // Cache yangilanadi
        }),
      );
    } catch (error) {
      throw new Error(`R2 update error: ${error.message}`);
    }

    await this.verifyWritten(key, JSON.stringify(newData));

    // Cache bypass uchun timestamp
    return `${this.publicUrl}/${key}?v=${Date.now()}`;
  }

  /**
   * Faylni o'chirish (DELETE)
   */
  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      console.log(`Deleted: ${key}`);
    } catch (error) {
      console.error('R2 delete error:', error.message);
    }
  }

  //Get one json
  async getJson(key: string): Promise<any> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      const bodyContents = await response.Body.transformToString();
      const jsonData = JSON.parse(bodyContents);

      console.log(`Retrieved: ${key}`);
      return jsonData;
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        throw new Error(`File not found: ${key}`);
      }
      throw new Error(`R2 get error: ${error.message}`);
    }
  }
}
