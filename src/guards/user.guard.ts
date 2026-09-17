import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { resolveUserSession, sessionPayload } from 'src/users/user-session';

@Injectable()
export class UserGuard implements CanActivate {
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

    // Hisob bazadan tekshiriladi (topshiriq №19, 2-band) — `is_admin` ham
    // tokendan emas, bazadan olinadi.
    const session = await resolveUserSession(payload);
    if (!session) {
      throw new UnauthorizedException(
        "Hisob faol emas yoki sessiya bekor qilingan — qayta kiring",
      );
    }

    // Egalik tekshiruvi uchun foydalanuvchi ma'lumotini requestga qo'shamiz
    req.user = sessionPayload(payload, session);
    req.userSession = session;
    return true;
  }
}
