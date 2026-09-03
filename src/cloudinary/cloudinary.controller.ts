import {
  BadRequestException,
  Controller,
  Delete,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CloudinaryService } from './cloudinary.service';
import { JwtOrServiceKeyGuard } from 'src/guards/jwt_or_service_key.guard';

@ApiTags('Images (Cloudinary)')
@Controller('images')
export class CloudinaryController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  // Ruxsat etilgan rasm turlari va ularning "magic bytes" imzosi.
  // Mijoz yuborgan mimetype'ga ISHONIB BO'LMAYDI (uni oson soxtalashtirish
  // mumkin), fayl esa ommaga ochiq havolada turadi — shuning uchun
  // faylning o'z boshidagi baytlarni tekshiramiz.
  private static readonly IMAGE_TYPES: Array<{
    mime: string;
    test: (b: Buffer) => boolean;
  }> = [
    {
      mime: 'image/jpeg',
      test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    },
    {
      mime: 'image/png',
      test: (b) =>
        b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
    },
    {
      mime: 'image/webp',
      test: (b) =>
        b.subarray(0, 4).toString('ascii') === 'RIFF' &&
        b.subarray(8, 12).toString('ascii') === 'WEBP',
    },
    {
      mime: 'image/gif',
      test: (b) => b.subarray(0, 3).toString('ascii') === 'GIF',
    },
    {
      // AVIF/HEIC — ISO-BMFF konteyner. DIQQAT: `ftyp` imzosining O'ZI
      // yetarli EMAS — MP4/MOV/3GP videolar ham aynan shu imzoga ega.
      // Shuning uchun "brand" (8-12 baytlar) ham tekshiriladi, aks holda
      // video yuklanib, Cloudinary uni "Invalid image file" deb rad etadi.
      mime: 'image/avif',
      test: (b) => {
        if (b.subarray(4, 8).toString('ascii') !== 'ftyp') return false;
        const brand = b.subarray(8, 12).toString('ascii');
        return [
          'avif',
          'avis',
          'heic',
          'heix',
          'hevc',
          'hevx',
          'mif1',
          'msf1',
        ].includes(brand);
      },
    },
  ];

  //Rasm yuklash — admin panel faylni to'g'ridan-to'g'ri yuboradi,
  //biz uni Cloudinary'ga qo'yib, ommaviy havolani qaytaramiz.
  @ApiOperation({ summary: "Rasm yuklash (Cloudinary) va havolasini olish" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Rasm yuklandi',
    schema: {
      example: {
        success: true,
        publicId: 'climavent/products/abcd1234',
        url: 'https://res.cloudinary.com/<cloud>/image/upload/v.../climavent/products/abcd1234.jpg',
        message: 'Rasm muvaffaqiyatli yuklandi',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      "Fayl yuborilmadi yoki rasm emas (JPG, PNG, WEBP, GIF, AVIF). " +
      "Tur mijoz aytgan mimetype bo'yicha emas, faylning magic-bytes'i " +
      "bo'yicha aniqlanadi.",
  })
  @UseGuards(JwtOrServiceKeyGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    }),
  )
  @Post('upload-image')
  async uploadImage(@UploadedFile() file: Express.Multer.File): Promise<{
    success: boolean;
    publicId: string;
    url: string;
    message: string;
  }> {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('Fayl yuborilmadi');
    }

    const detected = CloudinaryController.IMAGE_TYPES.find((t) =>
      t.test(file.buffer),
    );
    if (!detected) {
      throw new BadRequestException(
        'Faqat rasm yuklash mumkin (JPG, PNG, WEBP, GIF, AVIF)',
      );
    }

    const { url, publicId } = await this.cloudinaryService.uploadImage(
      file.buffer,
      'climavent/products',
    );

    return {
      success: true,
      publicId,
      url,
      message: 'Rasm muvaffaqiyatli yuklandi',
    };
  }

  //Rasmni Cloudinary'dan o'chirish (public_id bo'yicha).
  @ApiOperation({ summary: "Rasmni Cloudinary'dan o'chirish" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiQuery({
    name: 'publicId',
    example: 'climavent/products/abcd1234',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: "O'chirildi",
    schema: {
      example: { success: true, message: "Rasm o'chirildi" },
    },
  })
  @UseGuards(JwtOrServiceKeyGuard)
  @Delete('upload-image')
  async deleteImage(
    @Query('publicId') publicId: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!publicId) {
      throw new BadRequestException('publicId parametri majburiy');
    }
    await this.cloudinaryService.deleteImage(publicId);
    return { success: true, message: "Rasm o'chirildi" };
  }
}
