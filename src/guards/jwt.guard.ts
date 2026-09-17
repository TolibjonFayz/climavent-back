import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { resolveUserSession } from 'src/users/user-session';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Unauthorized(token not found)');
    }
    const [bearer, token] = authHeader.split(' ');

    if (bearer != 'Bearer' || !token) {
      throw new UnauthorizedException('Unauthorized(token not found)');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.ACCESS_TOKEN_KEY_USER,
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Imzo yetarli emas — hisob bazadan (topshiriq №19, 2-band)
    const session = await resolveUserSession(payload);
    if (!session) {
      throw new UnauthorizedException(
        "Hisob faol emas yoki sessiya bekor qilingan — qayta kiring",
      );
    }

    req.payload = payload;
    req.userSession = session;
    return true;
  }
}
