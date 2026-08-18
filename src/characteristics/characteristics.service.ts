import { CreateCharacteristicDto } from './dto/create-characteristic.dto';
import { UpdateCharacteristicDto } from './dto/update-characteristic.dto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Characteristic } from './model/characteristic.model';
import { InjectModel } from '@nestjs/sequelize';
import { R2Service } from 'src/r2/r2.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CharacteristicsService {
  constructor(
    @InjectModel(Characteristic)
    private readonly charecteristicRepository: typeof Characteristic,
    private r2Service: R2Service,
  ) {}

  uniqueId = uuidv4();

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

  //Create characteristic
  async createCharacteristics(
    createCharacteristicsDto: CreateCharacteristicDto,
  ) {
    const newBaner = await this.charecteristicRepository.create(
      createCharacteristicsDto,
    );

    const response = {
      message: 'Characteristic successfully created',
      newBaner,
    };
    return response;
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
  async getCharacteristicById(id: number) {
    const characteristic = await this.charecteristicRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
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
      if (this.hasMeaningfulHtml(payload.content)) {
        payload.content = await this.r2Service.uploadJson(
          (this.uniqueId = uuidv4()),
          payload.content,
        );
      } else {
        delete payload.content;
        delete payload.contentJson;
      }
    }
    if (payload.contentJson !== undefined) {
      payload.contentJson = await this.r2Service.uploadJson(
        (this.uniqueId = uuidv4()),
        payload.contentJson,
      );
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
