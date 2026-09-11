import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ServiceKeyGuard } from './service_key.guard';

/**
 * Mijozning O'ZI yoki ORQA OFIS (topshiriq №13, 1-band).
 *
 * Mijozga tegishli o'qish endpointlari (`users/one/:id`, `cart/oneuser/:id`,
 * `orders/oneuser/:id` va h.k.) faqat `UserSelfGuard` da edi — ya'ni
 * adminka mijoz sahifasini umuman ocha olmasdi.
 *
 * O'tadi:
 *   - SERVICE_API_KEY
 *   - sayt admini JWT (`is_admin`)
 *   - mijozning o'zi (`:id` == token egasi) — sayt shu yo'l bilan ishlaydi
 *
 * DO'KON TOKENI ATAYLAB QABUL QILINMAYDI: bu yerda mijozning shaxsiy
 * ma'lumoti (telefon, manzil, e-pochta) va BARCHA do'konlardagi
 * buyurtmalari bor. Do'kon admini begona do'kon mijozini ko'rmasligi
 * kerak.
 */
@Injectable()
export class UserSelfOrBackofficeGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly serviceKeyGuard: ServiceKeyGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    if (this.serviceKeyGuard.canActivate(context)) return true;

    const authHeader = req.headers.authorization;
    if (!authHeader) throw new UnauthorizedException('User unauthorized');
    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('User unauthorized');
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.ACCESS_TOKEN_KEY_USER,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    req.user = payload;
    if (payload?.is_admin) return true;

    // != (loose) — param satr, payload.id son
    if (payload?.id == null || payload.id != req.params?.id) {
      throw new ForbiddenException("Faqat o'z ma'lumotingizni ko'ra olasiz");
    }
    return true;
  }
}
