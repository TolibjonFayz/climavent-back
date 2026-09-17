import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { resolveStoreSession } from 'src/store_auth/store-session';
import { Courier } from './model/models';

/**
 * Kuryer endpointlari (`/api/courier/*`) — FAQAT kuryer tokeni (topshiriq №22, 1-band).
 *
 * Hisob bazadan tekshiriladi (№17): o'chirilgan hisob, nofaol profil yoki
 * almashgan parol — 401. Do'kon admini yoki superadmin tokeni — 403.
 * Kuryer profili `req.courier` ga qo'yiladi.
 */
@Injectable()
export class CourierGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const [bearer, token] = String(req.headers?.authorization || '').split(' ');
    if (bearer !== 'Bearer' || !token) throw new UnauthorizedException('Token yuborilmadi');

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.STORE_TOKEN_KEY || process.env.ACCESS_TOKEN_KEY,
      });
    } catch {
      throw new UnauthorizedException('Token yaroqsiz yoki muddati tugagan');
    }

    const session = await resolveStoreSession(payload);
    if (!session) throw new UnauthorizedException("Hisob faol emas yoki sessiya bekor qilingan — qayta kiring");
    if (session.role !== 'courier') throw new ForbiddenException('Bu endpoint faqat kuryer uchun');

    const courier = await Courier.findOne({ where: { store_user_id: session.user_id } });
    if (!courier || !courier.is_active) throw new UnauthorizedException('Kuryer profili faol emas');

    req.storeUser = session;
    req.courier = courier;
    return true;
  }
}
