import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { QuotesService } from './quotes.service';

/**
 * KP bo'limlari: 4 soatda do'konga eslatma, 24 soatda muddat (topshiriq №33, 2-band).
 *
 * 10 daqiqada bir. `QUOTE_JOBS_DISABLED=true` — o'chiradi (lokal sinov
 * prod bazasiga ulanganda haqiqiy xaridorlarga push ketmasin).
 * `QUOTE_JOBS_INTERVAL_MS` — faqat sinov uchun.
 */
@Injectable()
export class QuoteSectionJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(QuoteSectionJobs.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly quotes: QuotesService) {}

  onApplicationBootstrap() {
    if (process.env.QUOTE_JOBS_DISABLED === 'true') return;
    const every = Number(process.env.QUOTE_JOBS_INTERVAL_MS) || 10 * 60 * 1000;
    setTimeout(() => this.tick(), Math.min(every, 60 * 1000)).unref();
    this.timer = setInterval(() => this.tick(), every);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.quotes.sweepSections();
    } catch (e) {
      this.logger.error(`KP bo'limlari fon ishi yiqildi: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
