import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Setting } from './model/setting.model';
import { SettingEvent } from './model/setting-event.model';
import { CbuService } from './cbu.service';

export const USD_RATE_KEY = 'usd_rate';

export interface RateChangeContext {
  source: 'auto' | 'manual';
  actor?: string | null;
  ip?: string | null;
  note?: string | null;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectModel(Setting)
    private readonly settingRepository: typeof Setting,
    @InjectModel(SettingEvent)
    private readonly eventRepository: typeof SettingEvent,
    private readonly cbu: CbuService,
  ) {}

  // Dollar kursini qaytaradi. Sozlama yo'q bo'lsa yoki qiymat buzuq bo'lsa
  // xato tashlaymiz — taxminiy kurs bilan noto'g'ri narx ko'rsatgandan
  // ko'ra, mijoz tomon narxni umuman ko'rsatmagani xavfsizroq.
  async getUsdRate() {
    const setting = await this.settingRepository.findOne({
      where: { key: USD_RATE_KEY },
    });
    if (!setting) {
      throw new NotFoundException('Dollar kursi sozlanmagan');
    }
    const rate = Number(setting.value);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new NotFoundException("Dollar kursi qiymati noto'g'ri");
    }
    return {
      rate,
      updatedAt: setting.updatedAt,
    };
  }

  /**
   * Kursni yozadi va o'zgarishni TARIXGA tushiradi (topshiriq №19, 3-band).
   *
   * Qiymat o'zgarmagan bo'lsa tarixga yozilmaydi — kunlik cron bir xil kursni
   * qayta-qayta yozib, jadvalni to'ldirmasin.
   */
  async updateUsdRate(rate: number, ctx: RateChangeContext = { source: 'manual' }) {
    const setting = await this.settingRepository.findOne({
      where: { key: USD_RATE_KEY },
    });
    if (!setting) {
      throw new NotFoundException('Dollar kursi sozlanmagan');
    }
    const oldValue = setting.value;
    // Butun songa yaxlitlanmaydi — kursda tiyin bo'lishi mumkin (12345.50)
    const newValue = String(rate);

    // Qiymat o'zgarmagan bo'lsa ham `updatedAt` yangilanadi: adminkada
    // "kurs qachon tekshirilgan" ko'rinib tursin. `update` har doim
    // `updatedAt` ga tegadi — `save()` esa o'zgarish bo'lmasa hech narsa qilmaydi.
    await this.settingRepository.update(
      { value: newValue },
      { where: { key: USD_RATE_KEY } },
    );
    await setting.reload();

    if (oldValue !== newValue) {
      await this.eventRepository.create({
        key: USD_RATE_KEY,
        old_value: oldValue,
        new_value: newValue,
        source: ctx.source,
        actor: ctx.actor ?? null,
        ip: ctx.ip ?? null,
        note: ctx.note ?? null,
        created_at: new Date(),
      } as any);
    }

    return {
      rate: Number(setting.value),
      updatedAt: setting.updatedAt,
      changed: oldValue !== newValue,
    };
  }

  /**
   * Markaziy bankdan olib qo'yish. Kunlik cron ham, adminkadagi
   * «Bank kursini qo'yish» tugmasi ham shu yerga keladi (№20, 3-band).
   *
   * Manba ishlamasa — ESKI QIYMAT QOLADI va xato yuqoriga uzatiladi
   * (cron uni jurnalga yozadi, adminka esa foydalanuvchiga ko'rsatadi).
   */
  async refreshUsdRateFromCbu(ctx: Omit<RateChangeContext, 'source' | 'note'> & { source?: 'auto' | 'manual' } = {}) {
    const { rate, date } = await this.cbu.fetchUsd();
    return this.updateUsdRate(rate, {
      source: ctx.source ?? 'manual',
      actor: ctx.actor ?? null,
      ip: ctx.ip ?? null,
      note: `cbu.uz${date ? ' ' + date : ''}`,
    });
  }

  /** Kurs o'zgarishlari tarixi (adminka uchun). */
  async rateHistory(options: { page?: number; limit?: number } = {}) {
    const limit = Math.min(options.limit || 50, 200);
    const page = Math.max(options.page || 1, 1);
    const { rows, count } = await this.eventRepository.findAndCountAll({
      where: { key: USD_RATE_KEY },
      order: [['created_at', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    return { rows, total: count, page, limit };
  }
}
