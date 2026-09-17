import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { resolveUserSession, sessionPayload } from 'src/users/user-session';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Unauthorized');
    }

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('Unauthorized');
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.ACCESS_TOKEN_KEY_USER,
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Hisob har so'rovda bazadan tekshiriladi (topshiriq №19, 2-band):
    // adminlikdan tushirilgan yoki bloklangan hisob tokeni darhol o'ladi.
    const session = await resolveUserSession(payload);
    if (!session) {
      throw new UnauthorizedException(
        "Hisob faol emas yoki sessiya bekor qilingan — qayta kiring",
      );
    }
    if (!session.is_admin) {
      throw new ForbiddenException('Admin access required');
    }

    req.user = sessionPayload(payload, session);
    req.userSession = session;
    return true;
  }
}
