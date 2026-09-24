import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isServiceKey } from 'src/chats/chat-auth';
import { resolveStoreSession } from './store-session';
import { staffDecision } from './staff-permissions';

/**
 * Do'kon XODIMI ruxsatlari — BACKENDDA MAJBURIY (topshiriq №35, 5-band).
 *
 * GLOBAL guard (APP_GUARD): har bir HTTP so'rovda, marshrutning o'z guard'laridan
 * OLDIN ishlaydi. Faqat xodim tokenini tekshiradi — do'kon admini, superadmin,
 * kuryer, xaridor va tokensiz so'rovga tegmaydi (ular odatdagidek o'tadi).
 *
 * Xodim uchun qoida `STAFF_ROUTES` da: ro'yxatda yo'q marshrut — 403
 * (deny by default). Javob: `{ message: "Ruxsat yo'q", required: "orders.edit" }`.
 *
 * Token yaroqsiz bo'lsa bu guard HECH NARSA qilmaydi — 401 ni marshrutning
 * o'z guard'i beradi (xabar bir xil bo'lib qolsin).
 */
@Injectable()
export class StaffPermissionGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    if (isServiceKey(req.headers?.['x-api-key'])) return true;

    const [bearer, token] = String(req.headers?.authorization || '').split(' ');
    if (bearer !== 'Bearer' || !token) return true;

    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: process.env.STORE_TOKEN_KEY || process.env.ACCESS_TOKEN_KEY,
      });
    } catch {
      return true; // do'kon tokeni emas (xaridor) yoki yaroqsiz — marshrut guard'i hal qiladi
    }
    // Rol TOKENDAN EMAS, bazadan: superadmin rolini o'zgartirsa ham darhol amal qiladi
    const session = await resolveStoreSession(payload);
    if (!session?.staff) return true;

    const d = await staffDecision(req, session.staff.permissions);
    if (d.ok === true) return true;
    throw new ForbiddenException({
      statusCode: 403,
      message: "Ruxsat yo'q",
      required: d.required,
      ...(d.required ? {} : { reason: "Bu amal faqat do'kon admini uchun" }),
    });
  }
}
