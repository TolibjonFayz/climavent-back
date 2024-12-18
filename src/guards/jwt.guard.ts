import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Unauthorized(token not found)');
    }
    const bearer = authHeader.split(' ')[0];
    const token = authHeader.split(' ')[1];
    console.log(token);

    if (bearer != 'Bearer' || !token) {
      throw new UnauthorizedException('Unauthorized(token not found)');
    }

    const payload = this.verifyAccessToken(token);
    console.log(payload);
    req.payload = payload;

    return true;
  }

  private verifyAccessToken(token: string) {
    let check: any;
    try {
      check = this.jwtService.verify(token, {
        secret: process.env.ACCESS_TOKEN_KEY_USER,
      });
    } catch (error) {
      console.log(error);
      try {
        check = this.jwtService.verify(token, {
          secret: process.env.ACCESS_TOKEN_KEY_USER,
        });
      } catch (secondError) {
        throw new UnauthorizedException(secondError);
      }
    }
    return check;
  }
}
