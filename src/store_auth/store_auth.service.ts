import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { StoreUser } from 'src/store_users/model/store_user.model';
import { Store } from 'src/stores/model/store.model';
import { StoreLoginDto } from './dto/store-login.dto';
import { ConsentService } from 'src/offers/consent.service';

@Injectable()
export class StoreAuthService {
  constructor(
    @InjectModel(StoreUser)
    private readonly storeUserRepository: typeof StoreUser,
    private readonly jwtService: JwtService,
    private readonly consent: ConsentService,
  ) {}

  async login(dto: StoreLoginDto) {
    const user = await this.storeUserRepository.findOne({
      where: { login: dto.login },
      include: [{ model: Store }],
    });

    // Login topilmadi / parol xato / bloklangan — hamma holatda BIR XIL
    // xabar. Aks holda qaysi login mavjudligini taxmin qilish oson bo'ladi.
    const invalid = new UnauthorizedException("Login yoki parol noto'g'ri");
    if (!user || !user.is_active) throw invalid;

    // Parolsiz hisob (ariza tasdiqlangan, lekin sotuvchi hali parol
    // o'rnatmagan) — kirib bo'lmaydi. Tekshiruvsiz `bcrypt.compare` NULL
    // xeshda xato tashlab 500 berardi.
    if (!user.password_hash) throw invalid;
    const ok = await bcrypt.compare(dto.password, user.password_hash);
    if (!ok) throw invalid;

    await this.storeUserRepository.update(
      { last_login_at: new Date() },
      { where: { id: user.id }, silent: true },
    );

    const token = await this.jwtService.signAsync(
      {
        user_id: user.id,
        store_id: user.store_id ?? null,
        role: user.role,
        login: user.login,
        // Parol versiyasi: parol almashsa eski tokenlar yaroqsiz (№17)
        tv: user.token_version ?? 0,
      },
      {
        secret: process.env.STORE_TOKEN_KEY || process.env.ACCESS_TOKEN_KEY,
        expiresIn: process.env.STORE_TOKEN_TIME || '12h',
      },
    );

    // Oferta yangilangan bo'lsa — adminka kirishdan keyin tasdiqlash oynasini
    // ochadi (topshiriq №20, 2-band; oferta 12.3). Tasdiqlanmaguncha YOZISH
    // amallari 409 `offer_acceptance_required` qaytaradi.
    //
    // Superadmin sotuvchi emas — undan oferta so'ralmaydi.
    const offerPending =
      user.role === 'store_admin'
        ? await this.consent.pendingForStoreUser(user.id, user.store_id ?? null)
        : null;

    return {
      token,
      role: user.role,
      store: user.store ?? null,
      user: {
        id: user.id,
        login: user.login,
        full_name: user.full_name,
      },
      // `null` — tasdiqlash kerak emas
      offer_pending: offerPending,
    };
  }

  // Joriy hisob + do'koni. Token guard'da tekshirilgan.
  //
  // `offer_pending` bu yerda ham qaytadi: adminka sahifani yangilaganda
  // kirish javobi qo'lda bo'lmaydi (topshiriq №20, 2-band).
  async me(userId: number): Promise<Record<string, any>> {
    const user = await this.storeUserRepository.findByPk(userId, {
      include: [{ model: Store }],
    });
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Hisob faol emas');
    }
    const offerPending =
      user.role === 'store_admin'
        ? await this.consent.pendingForStoreUser(user.id, user.store_id ?? null)
        : null;
    return { ...user.get({ plain: true }), offer_pending: offerPending };
  }
}
