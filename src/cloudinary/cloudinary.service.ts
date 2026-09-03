import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor(private configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
      secure: true,
    });
  }

  /**
   * Rasmni Cloudinary'ga yuklaydi va ommaviy havolani qaytaradi.
   * `folder` — Cloudinary'dagi jild, masalan 'climavent/products'.
   */
  async uploadImage(
    buffer: Buffer,
    folder: string,
  ): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          // Cloudinary o'zi optimallashtiradi (format/hajm) — sifat
          // yo'qotilmasdan yengilroq fayl chiqadi.
          quality: 'auto',
          fetch_format: 'auto',
        },
        (error, result?: UploadApiResponse) => {
          if (error || !result) {
            const message = error?.message || "noma'lum xato";
            // Cloudinary faylni rad etsa — bu mijoz xatosi (400), server
            // xatosi (500) emas. Admin panelda tushunarli xabar chiqsin.
            if (/invalid image file|unsupported|not an image/i.test(message)) {
              return reject(
                new BadRequestException(
                  "Faylni rasm sifatida o'qib bo'lmadi. U buzuq bo'lishi " +
                    "yoki rasm emas (masalan video) bo'lishi mumkin. " +
                    "JPG, PNG yoki WEBP formatda yuklab ko'ring.",
                ),
              );
            }
            return reject(new Error(`Cloudinary upload error: ${message}`));
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      stream.end(buffer);
    });
  }

  /**
   * Rasmni Cloudinary'dan o'chiradi (public_id bo'yicha).
   * Xato bo'lsa jimgina log qiladi — o'chirish muvaffaqiyatsizligi
   * asosiy oqimni to'xtatmasin.
   */
  async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error('Cloudinary delete error:', error.message);
    }
  }
}
