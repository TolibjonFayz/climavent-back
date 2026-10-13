import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ChatFilesService } from './chat-files.service';

/**
 * Yuklangan, lekin 24 soat ichida xabarga bog'lanmagan chat fayllari
 * o'chiriladi (topshiriq №46, 1-band). Soatiga bir marta.
 * `CHAT_FILES_JOBS_DISABLED=true` — o'chiradi (lokal sinov prod bazasiga ulanganda).
 */
@Injectable()
export class ChatFilesJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ChatFilesJobs.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly files: ChatFilesService) {}

  onApplicationBootstrap() {
    if (process.env.CHAT_FILES_JOBS_DISABLED === 'true') return;
    const every = Number(process.env.CHAT_FILES_JOBS_INTERVAL_MS) || 60 * 60 * 1000;
    setTimeout(() => this.tick(), Math.min(every, 2 * 60 * 1000)).unref();
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
      let total = 0;
      for (let n = await this.files.sweepOrphans(); n > 0; n = await this.files.sweepOrphans()) total += n;
      if (total) this.logger.log(`Bog'lanmagan chat fayllari o'chirildi: ${total} ta`);
    } catch (e) {
      this.logger.error(`Chat fayllari fon ishi yiqildi: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
