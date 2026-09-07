import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { JwtOrServiceKeyGuard } from './jwt_or_service_key.guard';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';

// Orqa ofis yozuvchisi: SERVIS KALITI, SAYT ADMINI (JWT) yoki
// DO'KON HISOBI (store-auth tokeni) — uchtasidan biri yetarli.
//
// Nega kerak (topshiriq №11, 4-band): `r2` va `images` fayl yuklash
// modullari faqat `JwtOrServiceKeyGuard` da edi, ya'ni do'kon tokeni
// bilan 401 qaytarardi. Natijada adminka mahsulotni do'kon tokeni bilan
// tahrirlay olardi-yu, o'sha mahsulotga rasm yuklash uchun servis
// kalitiga o'tishga majbur bo'lardi — bitta oqim, ikkita guvohnoma.
//
// Izolyatsiya buzilmaydi: R2 obyekti va Cloudinary rasmi o'z-o'zicha
// hech kimga tegishli emas — ular mahsulotga ULANGANDA ma'no kasb
// etadi, ulash esa mahsulot endpointi orqali `StoreScopeGuard` bilan
// tekshiriladi.
@Injectable()
export class AdminOrStoreGuard implements CanActivate {
  constructor(
    private readonly jwtOrServiceKeyGuard: JwtOrServiceKeyGuard,
    private readonly storeAuthGuard: StoreAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Avval eski yo'l — servis kaliti yoki sayt admini. Ikkalasi ham
    // to'g'ri kelmasa, guard xato tashlaydi; uni yutib, do'kon tokenini
    // sinab ko'ramiz.
    try {
      if (await this.jwtOrServiceKeyGuard.canActivate(context)) return true;
    } catch {
      // e'tiborsiz — quyida do'kon tokeni sinaladi
    }

    try {
      return await this.storeAuthGuard.canActivate(context);
    } catch {
      // Uchala usul ham ishlamadi. Xabar umumiy: qaysi usul qabul
      // qilinishini aytamiz, lekin qaysi biri qayerda yiqilganini emas.
      throw new UnauthorizedException(
        "Kirish talab qilinadi: servis kaliti, admin tokeni yoki do'kon tokeni",
      );
    }
  }
}
