import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { JwtOrServiceKeyGuard } from './jwt_or_service_key.guard';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';

/**
 * MAYDONCHA darajasidagi yozish: servis kaliti, SAYT ADMINI yoki
 * do'kon panelining SUPERADMINI. Oddiy do'kon admini o'tmaydi.
 *
 * Nega kerak (topshiriq №19, 1-band):
 * kategoriyalar BUTUN maydoncha uchun umumiy — ular do'konga tegishli emas.
 * `AdminOrStoreGuard` bilan istalgan do'kon admini umumiy kategoriyani
 * yaratishi, nomini o'zgartirishi yoki O'CHIRISHI mumkin edi. O'chirilgan
 * kategoriya esa boshqa sotuvchilarning mahsulotlarini ham saytdan yo'qotardi.
 *
 * Do'kon admini kategoriyalarni avvalgidek O'QIY oladi (ro'yxat ochiq) va
 * o'z mahsulotiga mavjud kategoriyani tanlay oladi.
 */
@Injectable()
export class BackofficeSuperadminGuard implements CanActivate {
  constructor(
    private readonly jwtOrServiceKeyGuard: JwtOrServiceKeyGuard,
    private readonly storeAuthGuard: StoreAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Servis kaliti yoki sayt admini JWT
    try {
      if (await this.jwtOrServiceKeyGuard.canActivate(context)) return true;
    } catch {
      // e'tiborsiz — quyida do'kon tokeni sinaladi
    }

    let ok = false;
    try {
      ok = await this.storeAuthGuard.canActivate(context);
    } catch (e: any) {
      if (typeof e?.getStatus === 'function' && [403, 409].includes(e.getStatus())) throw e;
      throw new UnauthorizedException(
        "Kirish talab qilinadi: servis kaliti, sayt admini yoki superadmin tokeni",
      );
    }
    const req = context.switchToHttp().getRequest();
    if (ok && req.storeUser?.role === 'superadmin') return true;

    throw new ForbiddenException(
      "Bu amal faqat superadmin uchun: kategoriyalar butun maydoncha uchun umumiy",
    );
  }
}
