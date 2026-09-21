import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { SettingsService } from './settings.service';

const HOUR = 60 * 60 * 1000;
/** Necha soatda bir tekshiriladi. Markaziy bank kursni kuniga bir marta e'lon qiladi. */
const INTERVAL_MS = 6 * HOUR;
/** Server ko'tarilgandan keyin birinchi urinishgacha. */
const FIRST_DELAY_MS = 2 * 60 * 1000;

/**
 * Dollar kursini AVTOMATIK yangilash (topshiriq №19, 3-band; №20, 3-band).
 *
 * Nega kerak edi: kurs 12 000 da qotib qolgan, oxirgi qo'lda yangilanish
 * 02.09 — ikki hafta. Narxlar dollarda saqlanadi, ya'ni har bir eskirgan
 * kun saytda noto'g'ri so'm narxi degani.
 *
 * `@nestjs/schedule` bu loyihada o'rnatilmagan (ariza tozalash ishlari ham
 * shu sababdan oddiy intervalda), shuning uchun bu yerda ham interval.
 * 6 soatda bir tekshiriladi: kun davomida bir necha imkoniyat bo'lsin,
 * Markaziy bank ertalab javob bermay qolsa ham kun oxirigacha yangilanadi.
 *
 * Xato bo'lsa — eski qiymat QOLADI va jurnalga yoziladi. Noto'g'ri kurs
 * butun katalogni buzadi, eski kurs esa faqat biroz eskiradi.
 */
@Injectable()
export class UsdRateJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(UsdRateJobs.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly settings: SettingsService) {}

  onApplicationBootstrap() {
    if (process.env.USD_RATE_CRON_DISABLED === 'true') return;
    setTimeout(() => this.tick(), FIRST_DELAY_MS).unref();
    this.timer = setInterval(() => this.tick(), INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      // Topshiriq №27: avtomatik yangilash galochkasi o'chiq bo'lsa — JIM
      // turamiz (logga ham yozmaymiz). Kurs faqat qo'lda yoki adminkadagi
      // "Bank kursini qo'yish" tugmasi bilan o'zgaradi.
      const auto = await this.settings.getAutoUpdate();
      if (!auto.enabled) return;

      const res = await this.settings.refreshUsdRateFromCbu({ source: 'auto', actor: 'cron' });
      if (res.changed) {
        this.logger.log(`Dollar kursi yangilandi: ${res.rate}`);
      }
    } catch (e) {
      // Eski qiymat qoladi — bu ATAYLAB. Jurnalda ko'rinadi.
      this.logger.error(`Kursni yangilab bo'lmadi: ${(e as Error).message}`);
    }
  }
}
