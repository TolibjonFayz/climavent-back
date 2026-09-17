import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { QueryTypes } from 'sequelize';
import { StoreUser } from 'src/store_users/model/store_user.model';
import { Store } from 'src/stores/model/store.model';
import { StoreLoginDto } from './dto/store-login.dto';
import { ConsentService } from 'src/offers/consent.service';
import { journal, recentFailures, RequestMeta } from './login-journal';
import {
  findRefreshToken,
  issueRefreshToken,
  MOBILE_ACCESS_TTL,
  revokeAllRefreshTokens,
  revokeRefreshToken,
} from './mobile-session';

/** Parol almashtirishda noto'g'ri joriy parol: shuncha urinish ... */
const CHANGE_PW_MAX_FAILS = 5;
/** ... shu oynada (topshiriq №21, 1-band). */
const CHANGE_PW_WINDOW_MS = 15 * 60 * 1000;
const SALT_ROUNDS = 10;

@Injectable()
export class StoreAuthService {
  constructor(
    @InjectModel(StoreUser)
    private readonly storeUserRepository: typeof StoreUser,
    private readonly jwtService: JwtService,
    private readonly consent: ConsentService,
  ) {}

  async login(dto: StoreLoginDto, meta: RequestMeta = {}) {
    const user = await this.storeUserRepository.findOne({
      where: { login: dto.login },
      include: [{ model: Store }],
    });

    // Login topilmadi / parol xato / bloklangan — hamma holatda BIR XIL
    // xabar. Aks holda qaysi login mavjudligini taxmin qilish oson bo'ladi.
    // Jurnalda esa sabab farqlanmaydi ham: faqat `login_failed` (№21, 2-band).
    const invalid = new UnauthorizedException("Login yoki parol noto'g'ri");
    const fail = async () => {
      await journal('login_failed', { store_user_id: user?.id ?? null, login: dto.login }, meta);
      return invalid;
    };
    if (!user || !user.is_active) throw await fail();

    // Parolsiz hisob (ariza tasdiqlangan, lekin sotuvchi hali parol
    // o'rnatmagan) — kirib bo'lmaydi. Tekshiruvsiz `bcrypt.compare` NULL
    // xeshda xato tashlab 500 berardi.
    if (!user.password_hash) throw await fail();
    const ok = await bcrypt.compare(dto.password, user.password_hash);
    if (!ok) throw await fail();

    await this.storeUserRepository.update(
      { last_login_at: new Date() },
      { where: { id: user.id }, silent: true },
    );

    const mobile = dto.client === 'mobile';
    const token = await this.signToken(user, mobile ? MOBILE_ACCESS_TTL : undefined);
    const refresh = mobile ? await issueRefreshToken(user.id, user.token_version ?? 0, meta) : null;
    await journal('login_success', { store_user_id: user.id, login: user.login }, meta);

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
      // Faqat `client: "mobile"` (№22, 8-band). Nomi `refreshToken`: `refresh_token`
      // kaliti global maxfiylik filtrida (mijozning xeshini himoya qiladi) — javobdan
      // olib tashlanardi. Mijoz API'sidagi `tokens.refreshToken` bilan bir xil.
      ...(refresh
        ? { refreshToken: refresh.raw, refresh_expires_at: refresh.row.expires_at, expires_in: MOBILE_ACCESS_TTL }
        : {}),
    };
  }

  /**
   * Mobil ilova: refresh token bilan yangi juftlik (№22, 8-band).
   * Har chaqiruvda refresh ALMASHADI; eskisi qayta kelsa — hisobning barcha
   * refresh tokenlari bekor va 401.
   */
  async refresh(raw: string, meta: RequestMeta = {}) {
    const found = await findRefreshToken(raw);
    const denied = new UnauthorizedException('Sessiya tugagan yoki bekor qilingan — qayta kiring');
    if (found.ok === false) throw denied;
    const row = found.row;

    const user = await this.storeUserRepository.findByPk(row.store_user_id);
    if (!user || !user.is_active || Number(user.token_version ?? 0) !== Number(row.token_version)) {
      await revokeAllRefreshTokens(row.store_user_id);
      throw denied;
    }
    if (user.role === 'courier') {
      const rows: any[] = await this.storeUserRepository.sequelize.query(
        'SELECT is_active FROM couriers WHERE store_user_id = :id',
        { replacements: { id: user.id }, type: QueryTypes.SELECT },
      );
      if (!rows[0]?.is_active) {
        await revokeAllRefreshTokens(user.id);
        throw denied;
      }
    }

    // Shartli almashtirish: bir token bilan ikki so'rov bir vaqtda kelsa,
    // faqat bittasi o'tadi — ikkinchisi "qayta ishlatish" deb hisoblanadi.
    const [, affected]: any = await this.storeUserRepository.sequelize.query(
      'UPDATE store_refresh_tokens SET revoked_at = now() WHERE id = :id AND revoked_at IS NULL',
      { replacements: { id: row.id }, type: QueryTypes.UPDATE },
    );
    if (!affected) {
      await revokeAllRefreshTokens(user.id);
      throw denied;
    }
    const next = await issueRefreshToken(user.id, user.token_version ?? 0, meta);
    await this.storeUserRepository.sequelize.query(
      'UPDATE store_refresh_tokens SET replaced_by_id = :next WHERE id = :id',
      { replacements: { id: row.id, next: next.row.id }, type: QueryTypes.UPDATE },
    );

    return {
      token: await this.signToken(user, MOBILE_ACCESS_TTL),
      refreshToken: next.raw,
      refresh_expires_at: next.row.expires_at,
      expires_in: MOBILE_ACCESS_TTL,
    };
  }

  /** Joriy qurilmadan chiqish: refresh token bekor qilinadi. */
  async revokeDevice(raw?: string) {
    if (raw) await revokeRefreshToken(raw);
  }

  /** Panel tokeni. `tv` — parol versiyasi: parol almashsa eski tokenlar yaroqsiz (№17). */
  private signToken(user: StoreUser, expiresIn?: string) {
    return this.jwtService.signAsync(
      {
        user_id: user.id,
        store_id: user.store_id ?? null,
        role: user.role,
        login: user.login,
        tv: user.token_version ?? 0,
      },
      {
        secret: process.env.STORE_TOKEN_KEY || process.env.ACCESS_TOKEN_KEY,
        expiresIn: expiresIn || process.env.STORE_TOKEN_TIME || '12h',
      },
    );
  }

  /**
   * Parolni o'zi almashtirish (topshiriq №21, 1-band; oferta 4.10).
   *
   *   - joriy parol noto'g'ri → 401; 15 daqiqada 5 ta noto'g'ri urinishdan
   *     keyin → 429 (to'g'ri parol bilan ham — aks holda cheklov ma'nosiz);
   *   - yangi parol < 8 belgi yoki joriysi bilan bir xil → 400;
   *   - muvaffaqiyatda `token_version` oshadi (boshqa qurilmalar chiqib
   *     ketadi) va SHU sessiya uchun yangi token qaytadi.
   *
   * Chegara jurnaldagi `password_change_failed` yozuvlaridan sanaladi: server
   * qayta ishga tushsa ham, bir nechta nusxada ishlasa ham to'g'ri.
   */
  async changePassword(
    userId: number | undefined,
    currentPassword: string,
    newPassword: string,
    meta: RequestMeta = {},
  ) {
    if (!userId) {
      throw new BadRequestException("Servis kaliti bilan parol almashtirib bo'lmaydi — hisob tokeni kerak");
    }
    const user = await this.storeUserRepository.findByPk(userId);
    if (!user || !user.is_active) throw new UnauthorizedException('Hisob faol emas');

    const fails = await recentFailures(user.id, 'password_change_failed', CHANGE_PW_WINDOW_MS);
    if (fails >= CHANGE_PW_MAX_FAILS) {
      throw new HttpException(
        "Urinishlar ko'p — 15 daqiqadan keyin qayta urinib ko'ring",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ok = !!user.password_hash && (await bcrypt.compare(String(currentPassword ?? ''), user.password_hash));
    if (!ok) {
      await journal('password_change_failed', { store_user_id: user.id, login: user.login }, meta);
      throw new UnauthorizedException("Joriy parol noto'g'ri");
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      throw new BadRequestException("Yangi parol kamida 8 belgi bo'lsin");
    }
    if (await bcrypt.compare(newPassword, user.password_hash)) {
      throw new BadRequestException("Yangi parol joriysi bilan bir xil bo'lmasin");
    }

    await user.update({
      password_hash: await bcrypt.hash(newPassword, SALT_ROUNDS),
      token_version: (user.token_version ?? 0) + 1,
    } as any);
    await journal('password_changed', { store_user_id: user.id, login: user.login }, meta);
    // Mobil qurilmalar ham chiqib ketsin (token_version bilan ham o'ladi — aniq bo'lsin)
    await revokeAllRefreshTokens(user.id);

    return { token: await this.signToken(user) };
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
