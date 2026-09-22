import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { resolveStoreSession } from 'src/store_auth/store-session';
import { isCourierAllowedPath } from 'src/store_auth/store_auth.guard';
import { resolveUserSession } from 'src/users/user-session';

/**
 * So'rov egasi. `isPrivileged` ko'rinuvchanlik uchun yetarli, lekin do'kon
 * rekvizitlari (topshiriq №16, 8-band) uchun AYNAN kim ekani kerak:
 * `store_admin` faqat O'Z do'konining bank rekvizitlarini ko'radi.
 */
export interface Viewer {
  kind: 'service' | 'site_admin' | 'superadmin' | 'store_admin' | null;
  store_id: number | null;
}

declare module 'express' {
  interface Request {
    // Adminka/bot so'rovimi? Ommaviy o'qish endpointlari shu bayroqqa
    // qarab nofaol do'kon va yashirilgan mahsulotni ko'rsatadi yoki yo'q.
    isPrivileged?: boolean;
    viewer?: Viewer;
  }
}

/**
 * So'rov kim tomonidan qilinayotganini ANIQLAYDI, lekin HECH KIMNI
 * TO'XTATMAYDI (topshiriq №14, 1-band, 4-qadam).
 *
 * Nega guard emas: gap ruxsatda emas — bu endpointlar ochiq va ochiq
 * qolishi kerak. Gap KO'RINUVCHANLIKDA: mehmon faqat faol do'kon
 * mahsulotini ko'radi, adminka esa hammasini ko'rishi kerak
 * (nofaol do'kon mahsulotini tahrirlash uchun).
 *
 * Uch guvohnomaning istalgani "adminka" deb hisoblanadi:
 *   - SERVICE_API_KEY (bot va adminka)
 *   - sayt admini JWT (`is_admin`)
 *   - do'kon hisobi tokeni (store-auth)
 *
 * Guvohnoma yaroqsiz bo'lsa jimgina `false` bo'ladi — xato tashlanmaydi.
 */
@Injectable()
export class ViewerScopeMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    req.viewer = await this.aniqla(req);
    // MUHIM (topshiriq №29, 1-band): `site_admin` — ya'ni `users.is_admin`
    // tokeni — BU YERDA "adminka" deb HISOBLANMAYDI. Prod'dagi sayt
    // adminlari ayni paytda mobil ilova xaridori ham; ilgari ular ilovada
    // e'lon qilinmagan do'konlarning tovarini, nofaol bannerni va
    // yashirilgan sharhlarni ko'rib turgan.
    //
    // Orqa ofis ishi uchun do'kon hisobi (store-auth) yoki servis kaliti
    // ishlatiladi. Sayt adminining maxsus imkoni faqat ikki joyda saqlangan
    // (`products/alladmin`, `products/one/:id`) — `catalogScope(..., {
    // siteAdminSeesAll: true })` orqali.
    const kind = req.viewer.kind;
    req.isPrivileged = kind === 'service' || kind === 'superadmin' || kind === 'store_admin';
    next();
  }

  private async aniqla(req: Request): Promise<Viewer> {
    const guest: Viewer = { kind: null, store_id: null };
    if (this.servisKaliti(req)) return { kind: 'service', store_id: null };

    const authHeader = req.headers.authorization;
    if (!authHeader) return guest;
    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) return guest;

    // Sayt admini — imzo yetarli emas, `is_admin` bazadan (№19, 2-band).
    try {
      const payload: any = await this.jwtService.verifyAsync(token, {
        secret: this.config.get<string>('ACCESS_TOKEN_KEY_USER'),
      });
      const userSession = await resolveUserSession(payload);
      if (userSession?.is_admin) return { kind: 'site_admin', store_id: null };
      // Imzosi to'g'ri mijoz tokeni — bu do'kon tokeni emas, qidirishni to'xtatamiz
      if (userSession) return guest;
    } catch {
      // e'tiborsiz — quyida do'kon tokeni sinaladi
    }

    // Do'kon hisobi — imzo yetarli emas, hisob bazadan tekshiriladi (№17, 3-band).
    // Aks holda nofaol qilingan hisob tokeni nofaol do'konlar va bank
    // rekvizitlarini ko'rishda davom etardi.
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret:
          this.config.get<string>('STORE_TOKEN_KEY') ||
          this.config.get<string>('ACCESS_TOKEN_KEY'),
      });
    } catch {
      return guest;
    }
    const session = await resolveStoreSession(payload);
    if (!session) return guest;
    // Kuryer tokeni FAQAT o'z endpointlariga kiradi (№22, 1-band) — ochiq GET
    // endpointlar (katalog, do'konlar) ham bundan mustasno emas: token egasi
    // mehmon sifatida ham o'qiy olmasin, aks holda cheklov ma'nosiz.
    if (session.role === 'courier') {
      if (!isCourierAllowedPath(req)) {
        throw new ForbiddenException('Kuryer tokeni faqat /api/courier/* uchun');
      }
      return guest;
    }
    return session.role === 'superadmin'
      ? { kind: 'superadmin', store_id: null }
      : { kind: 'store_admin', store_id: session.store_id };
  }

  private servisKaliti(req: Request): boolean {
    const provided = req.headers['x-api-key'];
    const expected = this.config.get<string>('SERVICE_API_KEY');
    if (!expected || typeof provided !== 'string') return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    // Uzunlik oldin: timingSafeEqual teng uzunlik talab qiladi.
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
