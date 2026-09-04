import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

// Faqat superadmin (yoki SERVICE_API_KEY). StoreAuthGuard'dan KEYIN turadi.
@Injectable()
export class SuperadminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (req.storeUser?.role !== 'superadmin') {
      throw new ForbiddenException('Bu amal faqat superadmin uchun');
    }
    return true;
  }
}
