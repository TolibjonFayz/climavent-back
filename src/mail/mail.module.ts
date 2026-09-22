import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
// @nestjs-modules/mailer v2 da `dist/...` chuqur yo'li `exports` xaritasidan
// chiqarilgan — endi rasmiy yo'l `adapters/handlebars.adapter`. Eski yo'l
// bilan ilova ERR_PACKAGE_PATH_NOT_EXPORTED bilan KO'TARILMAYDI.
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: async (config: ConfigService) => ({
        transport: {
          host: config.get<string>('MAILER_HOST'),
          port: Number(config.get<string>('MAILER_PORT')) || 587,
          secure: false,
          auth: {
            user: config.get<string>('MAILDEV_USER'),
            pass: config.get<string>('MAILDEV_PASS'),
          },
        },
        defaults: {
          from: `"Jihozvent " <${config.get('MAILER_HOST')}>`,
        },
        template: {
          dir: join(__dirname, 'templates'),
          adapter: new HandlebarsAdapter(),
          template: 'confirmation',
          options: {
            strict: true,
          },
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [MailService],
  // `MailerService` — sotuvchi xabarnomalari uchun (№19, 4-band)
  exports: [MailService, MailerModule],
})
export class MailModule {}
