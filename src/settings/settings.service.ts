import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Setting } from './model/setting.model';

export const USD_RATE_KEY = 'usd_rate';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Setting)
    private readonly settingRepository: typeof Setting,
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

  async updateUsdRate(rate: number) {
    const setting = await this.settingRepository.findOne({
      where: { key: USD_RATE_KEY },
    });
    if (!setting) {
      throw new NotFoundException('Dollar kursi sozlanmagan');
    }
    // Butun songa yaxlitlanmaydi — kursda tiyin bo'lishi mumkin (12345.50)
    setting.value = String(rate);
    await setting.save();
    return {
      rate: Number(setting.value),
      updatedAt: setting.updatedAt,
    };
  }
}
