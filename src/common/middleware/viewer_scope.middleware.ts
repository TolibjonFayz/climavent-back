import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';

declare module 'express' {
  interface Request {
    // Adminka/bot so'rovimi? Ommaviy o'qish endpointlari shu bayroqqa
    // qarab nofaol do'kon va yashirilgan mahsulotni ko'rsatadi yoki yo'q.
    isPrivileged?: boolean;
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
    req.isPrivileged = await this.aniqla(req);
    next();
  }

  private async aniqla(req: Request): Promise<boolean> {
    if (this.servisKaliti(req)) return true;

    const authHeader = req.headers.authorization;
    if (!authHeader) return false;
    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) return false;

    // Sayt admini
    try {
      const payload: any = await this.jwtService.verifyAsync(token, {
        secret: this.config.get<string>('ACCESS_TOKEN_KEY_USER'),
      });
      if (payload?.is_admin) return true;
    } catch {
      // e'tiborsiz — quyida do'kon tokeni sinaladi
    }

    // Do'kon hisobi
    try {
      const payload: any = await this.jwtService.verifyAsync(token, {
        secret:
          this.config.get<string>('STORE_TOKEN_KEY') ||
          this.config.get<string>('ACCESS_TOKEN_KEY'),
      });
      return payload?.role === 'superadmin' || payload?.role === 'store_admin';
    } catch {
      return false;
    }
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
