import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { resolveStoreSession } from './store-session';
import { assertOfferAccepted } from 'src/offers/offer-gate';

// So'rov kim tomonidan qilinayotgani. Yozish endpointlari shu asosda
// cheklanadi (StoreScopeGuard).
export interface StoreRequester {
  role: 'superadmin' | 'store_admin' | 'courier';
  store_id: number | null;
  user_id?: number;
  login?: string;
}

// Do'kon paneli tokeni YOKI servis kaliti.
// `SERVICE_API_KEY` — SUPERADMIN sifatida qoladi: mavjud botlar va
// integratsiyalar buzilmaydi (topshiriq №10, 4-band, 3-qadam).
@Injectable()
export class StoreAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    if (this.isServiceKey(req)) {
      req.storeUser = { role: 'superadmin', store_id: null } as StoreRequester;
      return true;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) throw new UnauthorizedException('Token yuborilmadi');

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('Token formati xato');
    }

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

    // Imzo yetarli emas — hisob bazada bor, faol va parol almashmaganmi (№17)
    const session = await resolveStoreSession(payload);
    if (!session) {
      throw new UnauthorizedException("Hisob faol emas yoki sessiya bekor qilingan — qayta kiring");
    }
    // Kuryer tokeni — faqat o'z endpointlari (topshiriq №22, 1-band). Kirish,
    // parolni almashtirish va jurnal (`/store-auth/*`) unga ham ochiq.
    if (session.role === 'courier' && !isCourierAllowedPath(req)) {
      throw new ForbiddenException("Kuryer tokeni faqat /api/courier/* uchun");
    }
    req.storeUser = session;

    // Oferta yangilangan bo'lsa — tasdiqlamaguncha YOZISH to'siladi (№20, 2-band).
    // O'qish ishlayveradi.
    if (session.role === 'store_admin') {
      await assertOfferAccepted(req, session.user_id, session.store_id);
    }
    return true;
  }

  private isServiceKey(req: any): boolean {
    const provided = req.headers['x-api-key'];
    const expected = this.config.get<string>('SERVICE_API_KEY');
    if (!expected || typeof provided !== 'string') return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

/** Kuryer tokeni kira oladigan yo'llar (№22). */
export function isCourierAllowedPath(req: any): boolean {
  const path = String(req?.originalUrl || req?.url || '').split('?')[0];
  return /^\/api\/(courier|store-auth|devices)(\/|$)/.test(path);
}
