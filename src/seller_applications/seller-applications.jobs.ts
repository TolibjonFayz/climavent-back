import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { SellerApplicationsService } from './seller-applications.service';

const HOUR = 60 * 60 * 1000;

/**
 * Fon tozalash (topshiriq №16, 2-band):
 *   - 24 soat ichida arizaga bog'lanmagan yuklamalar o'chiriladi;
 *   - yakuniy holatdan 30 kun o'tgan arizalarning PASPORT fayllari
 *     o'chiriladi, yozuvda `deleted_at`, tarixda `documents_purged`.
 *
 * `@nestjs/schedule` o'rnatilmagan va bu muhitda npm o'rnatish ishonchsiz,
 * shuning uchun oddiy soatlik interval. Ikkala amal ham takroriy ishga
 * chidamli (idempotent) — bir nechta nusxa bir vaqtda ishlasa ham ziyon yo'q.
 */
@Injectable()
export class SellerApplicationsJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SellerApplicationsJobs.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly service: SellerApplicationsService) {}

  onApplicationBootstrap() {
    if (process.env.SELLER_JOBS_DISABLED === 'true') return;
    // Ishga tushishni sekinlashtirmasin — birinchi yurish biroz keyin
    setTimeout(() => this.tick(), 60 * 1000).unref();
    this.timer = setInterval(() => this.tick(), HOUR);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      await this.service.runMaintenance();
    } catch (e) {
      this.logger.error(`Tozalash yiqildi: ${(e as Error).message}`);
    }
  }
}
