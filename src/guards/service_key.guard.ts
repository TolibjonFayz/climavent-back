import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class ServiceKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const provided = req.headers['x-api-key'];
    const expected = this.config.get<string>('SERVICE_API_KEY');

    if (!expected || typeof provided !== 'string') return false;

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    // Uzunlik oldin tekshiriladi: timingSafeEqual teng uzunlik talab qiladi.
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
