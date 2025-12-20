import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from 'src/users/model/user.model';

@Injectable()
export class UserSelfGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const id = req?.params?.id;
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('User unauthorized');
    }

    const bearer = authHeader.split(' ')[0];
    const token = authHeader.split(' ')[1];
    if (bearer != 'Bearer' || !token) {
      throw new UnauthorizedException('User unauthorized');
    }

    async function verify(token: string, jwtService: JwtService) {
      try {
        const user: Partial<User> = await jwtService.verify(token, {
          secret: process.env.ACCESS_TOKEN_KEY_USER,
        });
        if (!user) {
          throw new UnauthorizedException('Invalid token provided');
        }

        if (user.id != id) {
          throw new UnauthorizedException('You are not you');
        }

        // if (!user.is_active) {
        //   throw new BadRequestException('User is not active');
        // }
        return true;
      } catch (error) {
        if (error.name === 'TokenExpiredError') {
          throw new UnauthorizedException('token expired');
        }
        throw error;
      }
    }
    return verify(token, this.jwtService);
  }
}