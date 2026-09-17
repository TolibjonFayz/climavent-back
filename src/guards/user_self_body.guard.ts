import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { resolveUserSession, sessionPayload } from 'src/users/user-session';

/**
 * Egalik tekshiruvi: so'rov body'sidagi `user_id` token egasiga tegishli
 * bo'lishi shart. Ya'ni foydalanuvchi faqat O'ZINING nomidan yozuv
 * yaratishi/o'chirishi mumkin (boshqa user_id ni yubora olmaydi).
 *
 * `:id` param o'rniga body.user_id ga tayanadigan endpoint'lar uchun
 * (masalan cart/create, likes/create, likes/delete).
 */
@Injectable()
export class UserSelfBodyGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('User unauthorized');
    }

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

    // Hisob bazadan (topshiriq №19, 2-band)
    const session = await resolveUserSession(payload);
    if (!session) {
      throw new UnauthorizedException(
        "Hisob faol emas yoki sessiya bekor qilingan — qayta kiring",
      );
    }

    const bodyUserId = req.body?.user_id;
    // != (loose) — string/number farqini hisobga oladi
    if (bodyUserId == null || session.id != bodyUserId) {
      throw new ForbiddenException('You can only modify your own data');
    }

    req.user = sessionPayload(payload, session);
    req.userSession = session;
    return true;
  }
}
