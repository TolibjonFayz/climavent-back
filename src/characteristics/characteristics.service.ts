import { CreateCharacteristicDto } from './dto/create-characteristic.dto';
import { UpdateCharacteristicDto } from './dto/update-characteristic.dto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Characteristic } from './model/characteristic.model';
import { InjectModel } from '@nestjs/sequelize';
import { R2Service } from 'src/r2/r2.service';

@Injectable()
export class CharacteristicsService {
  constructor(
    @InjectModel(Characteristic)
    private readonly charecteristicRepository: typeof Characteristic,
    private r2Service: R2Service,
  ) {}

  // HTML mazmunli (matn) bormi tekshiradi. "<p></p>", "<p>.</p>",
  // faqat bo'shliq/nuqta — mazmunsiz deb hisoblanadi. Bunday kontent
  // R2'ga yuklanmaydi (aks holda 0 baytli / bo'sh fayl hosil bo'ladi va
  // saytda bo'sh blok chiqadi).
  private hasMeaningfulHtml(html: unknown): boolean {
    if (typeof html !== 'string') return false;
    const text = html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/[.\s]/g, '')
      .trim();
    return text.length > 0;
  }

  private isR2Url(value: unknown): boolean {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
  }

  // Bo'sh mazmunmi? Satr uchun HTML tekshiruvi, obyekt uchun kalitlar soni.
  private isEmptyContent(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return !this.hasMeaningfulHtml(value);
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  // `content` / `contentJson` uchun YAGONA qoida — create ham, update ham
  // shuni ishlatadi (ilgari ikkalasi ikki xil ishlardi):
  //
  //   1) Tayyor R2 havolasi kelsa  -> shundayligicha saqlanadi.
  //      Ilgari update havolani YANGI faylga yozib, ichiga havolaning
  //      o'zini solib qo'yardi — saytda jadval o'rniga URL matni chiqardi.
  //   2) Satr yoki OBYEKT kelsa    -> R2'ga yuklanadi, havolasi saqlanadi.
  //      Obyekt endi JSON sifatida yoziladi (uploadJson JSON.stringify
  //      qiladi). Ilgari DTO uni String() bilan "[object Object]" ga
  //      aylantirib yuborardi va mazmun jimgina yo'qolardi.
  //   3) Bo'sh mazmun              -> `undefined`, ya'ni maydon tegilmaydi
  //      (mavjud havola saqlanib qoladi, 0 baytli fayl yaratilmaydi).
  private async resolveContentField(value: unknown): Promise<string | undefined> {
    if (value === undefined) return undefined;
    if (this.isR2Url(value)) return (value as string).trim();
    if (this.isEmptyContent(value)) return undefined;
    return this.r2Service.uploadJson(this.r2Service.buildJsonKey(), value);
  }

  //Create characteristic
  async createCharacteristics(
    createCharacteristicsDto: CreateCharacteristicDto,
  ) {
    // update bilan AYNAN bir xil qoida (topshiriq №9, 2-band).
    const payload: any = { ...createCharacteristicsDto };
    payload.content = await this.resolveContentField(payload.content);
    payload.contentJson = await this.resolveContentField(payload.contentJson);

    const created = await this.charecteristicRepository.create(payload);

    return {
      message: 'Characteristic successfully created',
      newCharacteristic: created,
      // Eski nom — mijoz kodlari buzilmasligi uchun bir muddat parallel
      // qoldirildi (topshiriq №9, 4-band).
      newBaner: created,
    };
  }

  //Get all characteristics (page/limit ixtiyoriy, standart 50 talik)
  async getAllCharacteristics(page?: number, limit?: number) {
    const effectiveLimit = limit || 50;
    const effectivePage = page || 1;
    const offset = (effectivePage - 1) * effectiveLimit;
    return this.charecteristicRepository.findAll({
      order: [['id', 'ASC']],
      limit: effectiveLimit,
      offset,
    });
  }

  //Get one characteristic by id
  // Topilmasa 404 — mahsulot va ichki variant ham shunday qiladi.
  // Ilgari bo'sh tanali 200 qaytarardi (topshiriq №10, 0-band).
  async getCharacteristicById(id: number) {
    const characteristic = await this.charecteristicRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (!characteristic) {
      throw new NotFoundException('Characteristic not found');
    }
    return characteristic;
  }

  //Update characteristic by id
  async updateCharacteristicById(id: number, payload: UpdateCharacteristicDto) {
    const existing = await this.charecteristicRepository.findByPk(id);
    if (!existing) {
      throw new NotFoundException('Characteristic not found or something wrong');
    }

    // Faqat haqiqatan yuborilgan bo'lsa R2'ga qayta yuklaymiz —
    // aks holda har bir title/price yangilanishida content/contentJson
    // "undefined" bilan almashtirilib, mavjud ma'lumot yo'qolib ketardi.
    //
    // Mazmunsiz (bo'sh) content yuborilsa — R2'ga yuklamaymiz va
    // payload'dan olib tashlaymiz, shunda mavjud content saqlanadi va
    // yangi 0 baytli fayl yaratilmaydi. contentJson uning jufti, shuning
    // uchun content bo'sh bo'lsa uni ham yubormaymiz.
    if (payload.content !== undefined) {
      const resolved = await this.resolveContentField(payload.content);
      if (resolved === undefined) {
        // Mazmunsiz kontent — maydonlarni tegmasdan qoldiramiz.
        // contentJson uning jufti, shuning uchun u ham chiqariladi.
        delete payload.content;
        delete payload.contentJson;
      } else {
        payload.content = resolved;
      }
    }
    if (payload.contentJson !== undefined) {
      const resolved = await this.resolveContentField(payload.contentJson);
      if (resolved === undefined) delete payload.contentJson;
      else payload.contentJson = resolved;
    }

    if (Object.keys(payload).length === 0) {
      return existing.dataValues;
    }

    const updated = await this.charecteristicRepository.update(payload, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else
      throw new NotFoundException('Characteristic not found or something wrong');
  }

  // Modelni tanlash sonini +1 qiladi.
  // Atomik SQL increment (o'qib-yozish emas) — bir vaqtda kelgan so'rovlar
  // bir-birini bosib ketmaydi. Mavjud bo'lmagan id'da 404.
  async incrementViews(id: number) {
    const existing = await this.charecteristicRepository.findByPk(id, {
      attributes: ['id'],
    });
    if (!existing) {
      throw new NotFoundException('Characteristic not found');
    }
    await this.charecteristicRepository.increment('views', { where: { id } });
    return { message: 'ok' };
  }

  //Delete characteristic by id
  async deleteCharacteristicById(id: number) {
    const characteristic = await this.getCharacteristicById(id);
    if (!characteristic) {
      throw new NotFoundException('Characteristic not found');
    }
    await this.charecteristicRepository.destroy({ where: { id: id } });
    return { message: 'Characteristic successfully deleted' };
  }
}
