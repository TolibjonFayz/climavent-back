import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { resolveStoreSession } from 'src/store_auth/store-session';
import { assertOfferAccepted } from 'src/offers/offer-gate';
import { Courier } from 'src/deliveries/model/models';

/**
 * Usta ilovasi — `/api/worker/*` (topshiriq №39, 7-band).
 *
 * Kirish uchun `couriers` da FAOL profil bo'lishi yetarli: kuryer hisobi
 * (`role = 'courier'`) ham, profil ulangan hamkor admini (yakka usta, №39
 * 2-band) ham kiradi — bitta telefon, bitta hisob. Profil yo'q hisob — 403.
 * Profil `req.courier` ga (DeliveriesService bilan bir xil nom) qo'yiladi.
 */
@Injectable()
export class WorkerGuard implements CanActivate {
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
    if (!session?.user_id) throw new UnauthorizedException("Hisob faol emas yoki sessiya bekor qilingan — qayta kiring");

    const courier = await Courier.findOne({ where: { store_user_id: session.user_id } });
    if (!courier) throw new ForbiddenException("Bu hisobda usta/kuryer profili yo'q");
    if (!courier.is_active) throw new UnauthorizedException('Usta profili faol emas');

    // Oferta: kuryer — kuryer ofertasi, hamkor admini — sotuvchi ofertasi (yozishda)
    if (session.role === 'courier') {
      await assertOfferAccepted(req, session.user_id, session.store_id ?? null, 'courier');
    } else if (session.role === 'store_admin') {
      await assertOfferAccepted(req, session.user_id, session.store_id ?? null);
    }
    req.storeUser = session;
    req.courier = courier;
    return true;
  }
}
