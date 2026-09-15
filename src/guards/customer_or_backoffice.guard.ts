import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { resolveStoreSession } from 'src/store_auth/store-session';

/**
 * MIJOZ (sayt) yoki ORQA OFIS (adminka) — ikkalasi ham o'tadi
 * (topshiriq №14, 2- va 3-bandlar).
 *
 * Nega kerak: `orders/update` va `reviews/delete` faqat mijoz JWT'sini
 * qabul qilardi. Natijada do'kon admini buyurtma holatini o'zgartira
 * olmasdi — buni faqat mijozning o'zi qila olardi, bu esa mantiqan
 * teskari. Ayni paytda mijoz JWT'si ham kerak bo'lib qoladi: to'lov
 * oqimida sayt buyurtma holatini o'zi yangilaydi.
 *
 * Guard faqat KIMLIGINI aniqlaydi. Nima qilishga haqli ekani servis
 * qatlamida hal qilinadi (`req.actor` orqali) — masalan do'kon admini
 * faqat butunlay o'ziga tegishli buyurtmani o'zgartira oladi.
 */
export interface RequestActor {
  kind: 'customer' | 'superadmin' | 'store_admin';
  user_id?: number; // mijoz yoki do'kon hisobi id'si
  is_admin?: boolean; // sayt admini (mijoz JWT ichida)
  store_id?: number | null; // store_admin uchun
}

@Injectable()
export class CustomerOrBackofficeGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    // 1) Servis kaliti — superadmin (bot va adminka)
    if (this.servisKaliti(req)) {
      req.actor = { kind: 'superadmin' } as RequestActor;
      return true;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) throw new UnauthorizedException('Unauthorized');
    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('Unauthorized');
    }

    // 2) Mijoz (yoki sayt admini) JWT
    try {
      const payload: any = await this.jwtService.verifyAsync(token, {
        secret: this.config.get<string>('ACCESS_TOKEN_KEY_USER'),
      });
      req.user = payload; // mavjud kod `req.user` ni kutadi
      req.actor = {
        kind: payload?.is_admin ? 'superadmin' : 'customer',
        user_id: payload?.id,
        is_admin: payload?.is_admin,
      } as RequestActor;
      return true;
    } catch {
      // e'tiborsiz — quyida do'kon tokeni sinaladi
    }

    // 3) Do'kon hisobi tokeni — hisob bazadan tekshiriladi (№17, 3-band)
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret:
          this.config.get<string>('STORE_TOKEN_KEY') ||
          this.config.get<string>('ACCESS_TOKEN_KEY'),
      });
    } catch {
      throw new UnauthorizedException('Token yaroqsiz yoki muddati tugagan');
    }
    const session = await resolveStoreSession(payload);
    if (!session) {
      throw new UnauthorizedException("Hisob faol emas yoki sessiya bekor qilingan — qayta kiring");
    }
    req.actor = {
      kind: session.role,
      user_id: session.user_id,
      store_id: session.store_id,
    } as RequestActor;
    return true;
  }

  private servisKaliti(req: any): boolean {
    const provided = req.headers['x-api-key'];
    const expected = this.config.get<string>('SERVICE_API_KEY');
    if (!expected || typeof provided !== 'string') return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
