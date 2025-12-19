import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
   * JSON yuklash (CREATE)
   */
  async uploadJson(key: string, data: any): Promise<string> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: JSON.stringify(data),
          ContentType: 'application/json',
          CacheControl: 'public, max-age=31536000',
        }),
      );
      return `${this.publicUrl}/${key}`;
    } catch (error) {
      throw new Error(`R2 upload error: ${error.message}`);
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

      // Cache bypass uchun timestamp
      const timestamp = Date.now();
      const urlWithCache = `${this.publicUrl}/${key}?v=${timestamp}`;

      console.log(`Updated: ${urlWithCache}`);
      return urlWithCache;
    } catch (error) {
      throw new Error(`R2 update error: ${error.message}`);
    }
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
