import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ServiceKeyGuard } from './service_key.guard';
import { AdminGuard } from './admin.guard';

// Bot xizmat kaliti (X-API-Key) bilan, sayt admini esa mavjud JWT
// (AdminGuard) bilan kiradi -- ikkalasidan biri yetarli.
@Injectable()
export class JwtOrServiceKeyGuard implements CanActivate {
  constructor(
    private readonly serviceKeyGuard: ServiceKeyGuard,
    private readonly adminGuard: AdminGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.serviceKeyGuard.canActivate(context)) return true;
    return this.adminGuard.canActivate(context);
  }
}
