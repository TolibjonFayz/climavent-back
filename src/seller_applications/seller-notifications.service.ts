import { Injectable, Logger, Optional } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

/** Sotuvchi kabineti (parol o'rnatish sahifasi shu yerda). */
const PORTAL_URL = (
  process.env.SELLER_PORTAL_URL || 'https://climavent-hamkor.vercel.app'
).replace(/\/+$/, '');
/** Ariza holati sahifasi — saytda. */
const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://climavent.uz').replace(/\/+$/, '');

export type NotifyKind = 'approved' | 'rejected' | 'needs_info' | 'received';

export interface NotifyResult {
  sent: boolean;
  channel: 'email' | null;
  target: string | null;
  error?: string;
}

/**
 * Ariza bo'yicha qaror haqida sotuvchiga xabar (topshiriq №19, 4-band;
 * oferta 3.4).
 *
 * KANAL — ELEKTRON POCHTA, SMS emas. Sabab: Eskiz orqali yuboriladigan har
 * bir SMS matni oldindan moderatsiyadan o'tgan shablon bo'lishi shart
 * (hozir tasdiqlangani faqat bitta — tasdiqlash kodi). Yangi matnli SMS
 * jimgina rad etilardi. Bundan tashqari parol o'rnatish havolasi uzun,
 * SMS ga sig'maydi. SMS kerak bo'lsa — Eskizda shablon tasdiqlatish kerak,
 * keyin shu servisga ikkinchi kanal qo'shiladi.
 *
 * MUHIM: xabar yuborilmasa QAROR BEKOR QILINMAYDI. Ariza tasdiqlangani —
 * asosiy ish; xabar esa qulaylik. Xato `seller_application_events` ga
 * yoziladi, superadmin havolani qo'lda yubora oladi (avvalgidek).
 */
@Injectable()
export class SellerNotificationsService {
  private readonly logger = new Logger(SellerNotificationsService.name);

  constructor(@Optional() private readonly mailer?: MailerService) {}

  async notify(
    kind: NotifyKind,
    app: { id: number; contact_email?: string; contact_name?: string; store_name?: string },
    extra: { passwordSetupToken?: string; statusToken?: string; reason?: string } = {},
  ): Promise<NotifyResult> {
    const to = (app.contact_email || '').trim();
    if (!to) {
      return { sent: false, channel: null, target: null, error: "Arizada e-pochta ko'rsatilmagan" };
    }
    if (!this.mailer || !process.env.MAILDEV_USER) {
      return { sent: false, channel: 'email', target: to, error: 'Pochta sozlanmagan' };
    }

    const { subject, html } = this.compose(kind, app, extra);
    try {
      await this.mailer.sendMail({
        to,
        // `from` ATAYLAB shu yerda: modul standarti xato edi (jo'natuvchi
        // sifatida e-pochta emas, SMTP serverning nomi turardi).
        from: `"Climavent" <${process.env.MAILDEV_USER}>`,
        subject,
        html,
      });
      return { sent: true, channel: 'email', target: to };
    } catch (e) {
      const error = (e as Error).message?.slice(0, 200) || 'noma\'lum xato';
      this.logger.error(`Ariza #${app.id} xabari yuborilmadi (${to}): ${error}`);
      return { sent: false, channel: 'email', target: to, error };
    }
  }

  private compose(
    kind: NotifyKind,
    app: { contact_name?: string; store_name?: string },
    extra: { passwordSetupToken?: string; statusToken?: string; reason?: string },
  ) {
    const salom = app.contact_name ? `Assalomu alaykum, ${esc(app.contact_name)}!` : 'Assalomu alaykum!';
    const statusUrl = extra.statusToken
      ? `${SITE_URL}/sotuvchi-bolish/holat/${encodeURIComponent(extra.statusToken)}`
      : null;

    if (kind === 'approved') {
      const setupUrl = `${PORTAL_URL}/parol-ornatish?token=${encodeURIComponent(extra.passwordSetupToken || '')}`;
      return {
        subject: 'Climavent — arizangiz tasdiqlandi',
        html: wrap(`
          <p>${salom}</p>
          <p><b>${esc(app.store_name || "Do'koningiz")}</b> uchun sotuvchi arizangiz tasdiqlandi.</p>
          <p>Kabinetga kirish uchun avval parol o'rnating:</p>
          <p><a href="${setupUrl}">${setupUrl}</a></p>
          <p>Havola <b>72 soat</b> amal qiladi. Muddati o'tsa, biz yangisini yuborib beramiz.</p>
          <p>Parol o'rnatilgach kabinetga shu manzildan kirasiz: <a href="${PORTAL_URL}">${PORTAL_URL}</a></p>
        `),
      };
    }

    if (kind === 'received') {
      return {
        subject: 'Climavent — arizangiz qabul qilindi',
        html: wrap(`
          <p>${salom}</p>
          <p><b>${esc(app.store_name || "Do'kon")}</b> uchun sotuvchi arizangiz qabul qilindi va ko'rib chiqishga yuborildi.</p>
          ${statusUrl ? `<p>Ariza holatini shu havoladan kuzatib borishingiz mumkin (havolani saqlab qo'ying):</p><p><a href="${statusUrl}">${statusUrl}</a></p>` : ''}
          <p>Qaror chiqqach shu manzilga xabar yuboramiz.</p>
        `),
      };
    }

    if (kind === 'needs_info') {
      return {
        subject: "Climavent — arizangiz bo'yicha qo'shimcha ma'lumot kerak",
        html: wrap(`
          <p>${salom}</p>
          <p>Arizangizni ko'rib chiqdik, lekin davom etish uchun qo'shimcha ma'lumot kerak:</p>
          <blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #55cdf8;background:#f5fbfe">
            ${esc(extra.reason || '')}
          </blockquote>
          ${statusUrl ? `<p>To'ldirish uchun ariza sahifasini oching:</p><p><a href="${statusUrl}">${statusUrl}</a></p>` : ''}
        `),
      };
    }

    return {
      subject: 'Climavent — arizangiz rad etildi',
      html: wrap(`
        <p>${salom}</p>
        <p>Afsuski, sotuvchi arizangiz rad etildi.</p>
        <blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #d94b4b;background:#fdf5f5">
          ${esc(extra.reason || '')}
        </blockquote>
        ${statusUrl ? `<p>Ariza sahifasi: <a href="${statusUrl}">${statusUrl}</a></p>` : ''}
        <p>Kamchiliklar bartaraf etilgach yangi ariza topshirishingiz mumkin.</p>
      `),
    };
  }
}

// Ariza matnlari sotuvchidan keladi — xatga qo'yishdan oldin tozalanadi.
function esc(v: string): string {
  return String(v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function wrap(body: string): string {
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222">
    ${body}
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0">
    <p style="font-size:13px;color:#777">Climavent.uz — havo tozalash va iqlim texnikasi maydonchasi</p>
  </div>`;
}
