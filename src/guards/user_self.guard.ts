import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { resolveUserSession, sessionPayload } from 'src/users/user-session';

/**
 * `:id` param token egasiga tegishli bo'lishi shart.
 *
 * Hisob har so'rovda bazadan tekshiriladi (topshiriq №19, 2-band): bloklangan
 * yoki o'chirilgan hisob tokeni muddati tugaguncha ishlab turmasin.
 */
@Injectable()
export class UserSelfGuard implements CanActivate {
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
    } catch (error) {
      throw new UnauthorizedException(
        error?.name === 'TokenExpiredError' ? 'token expired' : 'Invalid token provided',
      );
    }

    const session = await resolveUserSession(payload);
    if (!session) {
      throw new UnauthorizedException(
        "Hisob faol emas yoki sessiya bekor qilingan — qayta kiring",
      );
    }

    // != (loose) — param satr, id son
    if (session.id != req?.params?.id) {
      throw new UnauthorizedException('You are not you');
    }

    req.user = sessionPayload(payload, session);
    req.userSession = session;
    return true;
  }
}
