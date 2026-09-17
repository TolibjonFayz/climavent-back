import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { purgeOldLogins } from './login-journal';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Kirishlar jurnalini 12 oydan keyin o'chirish (topshiriq №21, 2-band —
 * maxfiylik siyosatidagi muddat). Kuniga bir marta; takroriy ishga chidamli.
 */
@Injectable()
export class StoreAuthJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(StoreAuthJobs.name);
  private timer: NodeJS.Timeout | null = null;

  onApplicationBootstrap() {
    if (process.env.SELLER_JOBS_DISABLED === 'true') return;
    setTimeout(() => this.tick(), 5 * 60 * 1000).unref();
    this.timer = setInterval(() => this.tick(), DAY);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      const n = await purgeOldLogins();
      if (n) this.logger.log(`Kirishlar jurnali: ${n} ta eski yozuv o'chirildi`);
    } catch (e) {
      this.logger.error(`Jurnal tozalash yiqildi: ${(e as Error).message}`);
    }
  }
}
