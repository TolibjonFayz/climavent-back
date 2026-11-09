import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as Handlebars from 'handlebars';
import * as nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';

// `@nestjs-modules/mailer` o'rniga (2026-11-09): u bizga faqat
// nodemailer + bitta handlebars shabloni uchun kerak edi, lekin o'zi bilan
// mjml / preview-email zanjirini olib kelardi — `npm audit` dagi barcha
// 34 ta "moderate" shu zanjirdan edi. Interfeys (`sendMail({ to, subject,
// text | html | template + context })`) avvalgidek, chaqiruvchilar o'zgarmadi.
export interface MailOptions extends SendMailOptions {
  /** `templates/` ichidagi `.hbs` fayl nomi (`./confirmation` ham bo'ladi) */
  template?: string;
  context?: Record<string, unknown>;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger('Mailer');
  private readonly templates = new Map<string, Handlebars.TemplateDelegate>();
  private transporter?: Transporter;

  private getTransporter(): Transporter {
    // Birinchi xatda yaratiladi: env o'qilgan bo'ladi, SMTP sozlanmagan
    // lokal muhitda ilova ko'tarilishiga xalaqit bermaydi.
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.MAILER_HOST,
        port: Number(process.env.MAILER_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.MAILDEV_USER,
          pass: process.env.MAILDEV_PASS,
        },
      });
    }
    return this.transporter;
  }

  private render(name: string, context: Record<string, unknown> = {}): string {
    const key = name.replace(/^\.\//, '').replace(/\.hbs$/, '');
    if (!/^[a-z0-9_-]+$/i.test(key)) throw new Error(`Noto'g'ri shablon nomi: ${name}`);
    let tpl = this.templates.get(key);
    if (!tpl) {
      const src = readFileSync(join(__dirname, 'templates', `${key}.hbs`), 'utf8');
      tpl = Handlebars.compile(src, { strict: true });
      this.templates.set(key, tpl);
    }
    return tpl(context);
  }

  async sendMail(options: MailOptions) {
    const { template, context, ...mail } = options;
    if (template) mail.html = this.render(template, context);
    // Standart jo'natuvchi — SMTP login (avval xato bilan server NOMI turardi)
    if (!mail.from) mail.from = `"Climavent" <${process.env.MAILDEV_USER}>`;
    try {
      return await this.getTransporter().sendMail(mail);
    } catch (e) {
      this.logger.warn(`Xat yuborilmadi (${String(mail.to)}): ${(e as Error).message}`);
      throw e;
    }
  }
}
