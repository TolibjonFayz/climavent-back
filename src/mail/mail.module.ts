import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailerService } from './mailer.service';

// GLOBAL: `MailerService` ni `orders/quotes.service` modul importisiz
// (`@Optional()` bilan) oladi — eski `@nestjs-modules/mailer` ham global edi.
@Global()
@Module({
  providers: [MailService, MailerService],
  // `MailerService` — sotuvchi xabarnomalari va KP xatlari uchun (№19, 4-band)
  exports: [MailService, MailerService],
})
export class MailModule {}
