import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { dates, decode, encode } from '../common/helpers/crypto';
import { AddMinutesToDate } from '../common/helpers/addMinutes';
import { IOtpType } from '../common/types/decode-otp.type';
import { RegisterUserDto } from './dto/register-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto.';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { MailService } from '../mail/mail.service';
import { OtpService } from 'src/otp/otp.service';
import { InjectModel } from '@nestjs/sequelize';
import { Otp } from 'src/otp/models/otp.model';
import { hashOtp, otpMatches } from 'src/otp/otp-hash';
import * as otpGenerator from 'otp-generator';
import { User } from './model/user.model';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { SignoutDto } from './dto/signout.dto';
import { Like } from 'src/likes/model/like.model';
import { Cart } from 'src/cart/models/cart.model';
import { Op } from 'sequelize';
import { ConsentService } from 'src/offers/consent.service';
import {
  findUserRefreshToken,
  issueUserRefreshToken,
  MOBILE_ACCESS_TTL,
  MOBILE_REFRESH_DAYS,
  revokeAllUserRefreshTokens,
  revokeUserRefreshToken,
  rotateUserRefreshToken,
  SessionMeta,
  WEB_ACCESS_TTL,
  WEB_REFRESH_DAYS,
} from './user-mobile-session';

// OTP cheklovlari — SMS pullik, shuning uchun suiiste'moldan himoya kerak
const OTP_RESEND_COOLDOWN_MS = 5 * 60 * 1000; // bitta raqamga 5 daqiqada 1 marta
const OTP_DAILY_LIMIT = 5; // bitta raqamga sutkasiga necha marta SMS
const OTP_MAX_ATTEMPTS = 3; // bitta kodga necha marta noto'g'ri urinish mumkin
// Tasdiqlanmagan (is_active=false) "yaratib tashlab ketilgan" foydalanuvchilarni
// shuncha vaqtdan keyin eskirgan deb hisoblab, keyingi login'da tozalaymiz
const STALE_UNVERIFIED_USER_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User) private UsersRepository: typeof User,
    @InjectModel(Otp) private readonly otpRepo: typeof Otp,
    @InjectModel(Like) private readonly likeRepo: typeof Like,
    @InjectModel(Cart) private readonly cartRepo: typeof Cart,
    private readonly jwtservice: JwtService,
    private readonly consent: ConsentService,
    private readonly mailService: MailService,
    private readonly otpService: OtpService,
  ) {}

  // Registering new user
  async registerNewUser(registerUserDto: RegisterUserDto, res: Response) {
    // Is user exists
    // const isUserExists = await this.UsersRepository.findOne({
    //   where: { email: registerUserDto.email },
    // });
    // if (isUserExists) throw new BadRequestException('User already exists');
    // //Password is hashing
    // const hashed_password = await bcrypt.hash(registerUserDto.name, 8);
    // //User is registering
    // const newuser = await this.UsersRepository.create({
    //   ...registerUserDto,
    //   password: hashed_password,
    // });
    // //Refresh and access tokens are generating
    // const tokens = await this.getTokens(newuser);
    // //Update user
    // const hashed_refresh_token = await bcrypt.hash(tokens.refreshToken, 7);
    // const uniqueKey: string = randomUUID();
    // const updateUser = await this.UsersRepository.update(
    //   {
    //     refresh_token: hashed_refresh_token,
    //     unique_id: uniqueKey,
    //   },
    //   {
    //     where: { id: newuser.id },
    //     returning: true,
    //   },
    // );
    // //Cookie setting
    // res.cookie('refresh_token', tokens.refreshToken, {
    //   maxAge: 15 * 24 * 60 * 60 * 1000,
    // });
    // //Sending data to front
    // const response = {
    //   message: 'User signed up successfully',
    //   user: updateUser[1][0],
    //   tokens,
    // };
    // //sending email to admin
    // try {
    //   await this.mailService.sendAdminConfrmation(updateUser[1][0]);
    // } catch (error) {
    //   console.log(error);
    // }
    // //Send response
    // return response;
  }

  //Activate user
  async activateUser(link: string) {
    if (!link) throw new BadRequestException('Activation link not found');

    const updateUser = await this.UsersRepository.update(
      { is_active: true },
      { where: { unique_id: link, is_active: false }, returning: true },
    );

    if (!updateUser[1][0]) {
      throw new BadRequestException(
        'Sizning emailingiz allaqachon aktivlashtirilgan, bemalol foydalanishingiz mumkin.',
      );
    }

    const response = {
      message: 'User successfully updated',
      worker: updateUser,
    };

    return response;
  }

  /**
   * Raqamni YAGONA shaklga keltiradi: `+998XXXXXXXXX`.
   *
   * Ilgari `login` raqamni qanday kelsa shunday izlardi va shunday
   * yozardi, SMS esa faqat raqamlarini olib yuborilardi. Ya'ni
   * "+998 90 815 04 12" va "+998908150412" — bitta odam, ikkita hisob;
   * bunday hisobni `verify-otp` bilan faollashtirib ham bo'lmasdi
   * (u normallashtirilgan raqam bilan solishtiradi).
   */
  private normalizePhone(value: string): string {
    const digits = String(value ?? '').replace(/\D/g, '');
    const phone = `+${digits}`;
    if (!/^\+998\d{9}$/.test(phone)) {
      throw new BadRequestException(
        "Telefon raqam +998XXXXXXXXX ko'rinishida bo'lishi kerak",
      );
    }
    return phone;
  }

  // Login user — faqat OTP yuboradi. Token OTP tasdiqlangandan keyin beriladi.
  async loginUser(loginuserDto: LoginUserDto) {
    loginuserDto.phone_number = this.normalizePhone(loginuserDto.phone_number);
    //Is user exists?
    let user = await this.UsersRepository.findOne({
      where: { phone_number: loginuserDto.phone_number },
    });

    // Rozilik (topshiriq №18). Yangi raqam uchun sayt belgini SMS DAN OLDIN
    // so'raydi: `check_consent` bilan kelib, versiyalar yo'q bo'lsa — SMS
    // yuborilmaydi, yozuv ham yaratilmaydi. Hisobi bor (faol) odamdan so'ralmaydi.
    const versions = await this.checkConsentVersions(loginuserDto);
    const isNew = !user || !user.is_active;
    if (loginuserDto.check_consent === true && !versions) {
      if (isNew) {
        return {
          consent_required: true,
          terms: await this.consent.currentPublic('buyer'),
          privacy: await this.consent.currentPublic('privacy'),
        };
      }
      // MAVJUD foydalanuvchi: qabul qilgan versiyasi eskirgan bo'lsa ham
      // so'raladi (topshiriq №20, 2-band). Hujjat yangilanganda eski
      // foydalanuvchi yangi shartlarni ko'rmay qolmasin.
      const pending = await this.consent.pendingForUser(user.id);
      if (pending) {
        return { consent_required: true, terms: pending.terms, privacy: pending.privacy };
      }
    }

    if (!user) {
      // Eskirgan, hech qachon tasdiqlanmagan (login qilib, OTP kiritilmagan)
      // yozuvlarni tozalab turamiz — aks holda baza soxta raqamlar bilan to'ladi.
      await this.UsersRepository.destroy({
        where: {
          is_active: false,
          createdAt: {
            [Op.lt]: new Date(Date.now() - STALE_UNVERIFIED_USER_MS),
          },
        },
      });

      user = await this.UsersRepository.create({
        phone_number: loginuserDto.phone_number,
      });
    }

    const otpinfo = await this.signInWithOtp(loginuserDto.phone_number);

    // MUHIM: token bu yerda BERILMAYDI — aks holda OTP tekshiruvi ma'nosiz bo'ladi.
    const response = {
      message: 'Verification code sent to user',
      user: { id: user.id, phone_number: user.phone_number },
      otpinfo,
    };
    return response;
  }

  /**
   * CHIQISH (`POST /api/users/signout { refresh_token }`).
   *
   * Ikki xil refresh tokenni ham qabul qiladi (topshiriq №29, 3-band):
   *   - mobil ilovaning shaffof bo'lmagan tokeni — shu QURILMA sessiyasi
   *     bekor qilinadi (boshqa qurilmalar ishlab turadi);
   *   - saytning JWT refresh tokeni — eskicha `users.refresh_token`
   *     tozalanadi va cookie o'chiriladi.
   *
   * TUZATILDI: ilgari token `REFRESH_TOKEN_KEY` (do'kon/xodim kaliti) bilan
   * tekshirilardi, xaridor tokeni esa `REFRESH_TOKEN_KEY_USER` bilan
   * imzolanadi. Ya'ni `signout` HAR DOIM imzo xatosi bilan yiqilardi
   * (`jwt.verify` xato tashlaydi -> 500) va hech qachon hech narsani bekor
   * qilmagan.
   */
  async signOutUser(signoutDto: SignoutDto, res: Response) {
    const raw = String(signoutDto?.refresh_token ?? '').trim();
    if (!raw) throw new BadRequestException('refresh_token yuborilmadi');

    // Mobil (shaffof bo'lmagan) token
    if (raw.split('.').length !== 3) {
      const revoked = await revokeUserRefreshToken(raw);
      res.clearCookie('refresh_token');
      // Bekor qilinmagan (allaqachon bekor yoki noma'lum) token uchun ham
      // 200: chiqish g'oyasi bajarilgan, xato ilovani qotirmasin.
      return { message: 'User signed out successfully', revoked };
    }

    let userData: any;
    try {
      userData = await this.jwtservice.verifyAsync(raw, {
        secret: process.env.REFRESH_TOKEN_KEY_USER,
      });
    } catch {
      // Imzo yaroqsiz — sessiya baribir yo'q, cookie tozalanadi.
      res.clearCookie('refresh_token');
      return { message: 'User signed out successfully', revoked: false };
    }
    await this.UsersRepository.update(
      { refresh_token: null },
      { where: { id: userData.id } },
    );
    res.clearCookie('refresh_token');
    return { message: 'User signed out successfully', revoked: true };
  }

  //Get all users
  // Mijozlar ro'yxati — adminka "Foydalanuvchilar" bo'limi uchun
  // (topshiriq №13, 1-band).
  //
  // Ilgari parametrsiz butun jadvalni qaytarardi. Mijoz soni minglab
  // bo'lganda bu ishlamaydi, shuning uchun sahifalanadi va qidiriladi.
  // Jami son (filtrdan keyingi) `total` da qaytadi — controller uni
  // `X-Total-Count` sarlavhasiga qo'yadi, javob tanasi esa oldingidek
  // MASSIV bo'lib qoladi.
  //
  // Maxfiy maydonlar (refresh_token, unique_id) global JSON filtri
  // tomonidan javobdan chiqariladi — `common/serialization`.
  async getAllUsers(options: { page?: number; limit?: number; search?: string } = {}) {
    const limit = Math.min(options.limit || 50, 500);
    const page = options.page || 1;
    const q = (options.search || '').trim();

    const where = q
      ? {
          [Op.or]: [
            { name: { [Op.iLike]: `%${q}%` } },
            { surname: { [Op.iLike]: `%${q}%` } },
            { email: { [Op.iLike]: `%${q}%` } },
            // Telefonni bo'shliq/defissiz ham topsin: "90 123-45-67"
            { phone_number: { [Op.iLike]: `%${q.replace(/[\s()-]/g, '')}%` } },
          ],
        }
      : {};

    const { rows, count } = await this.UsersRepository.findAndCountAll({
      where,
      include: { all: true },
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });
    return { rows, total: count };
  }

  //Get user by id
  async getUserById(id: number) {
    const user = await this.UsersRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // Hisobga EGALIKKA tegadigan maydonlar. O'zgarsa — barcha eski tokenlar
  // bekor bo'ladi (topshiriq №19, 2-band):
  //   phone_number — hisob boshqa odamga o'tdi;
  //   is_admin     — adminlik berildi/olindi;
  //   is_active    — hisob bloklandi yoki qayta ochildi.
  // `is_admin`/`is_active` baribir har so'rovda bazadan o'qiladi — bu
  // qo'shimcha qatlam: o'chirilgan huquq refresh token orqali qaytmasin.
  private static readonly SESSION_BREAKING_FIELDS = ['phone_number', 'is_admin', 'is_active'];

  //Update user by id
  async updateUser(id: number, updateUserDto: UpdateUserDto) {
    const before = await this.UsersRepository.findByPk(id);
    if (!before) throw new NotFoundException('User not found');

    // TELEFON RAQAM profil shakli orqali ALMASHTIRILMAYDI (xavfsizlik
    // tekshiruvi, №29). Bu endpoint `UserSelfGuard` ostida, ya'ni hisob
    // egasi o'zi chaqiradi — va ilgari istalgan raqamni, SMS TASDIG'ISIZ,
    // o'ziga yozib qo'ya olardi. Natijada:
    //   - boshqa odamning raqami bilan ikkinchi hisob paydo bo'lardi
    //     (`phone_number` da unikal cheklov ham yo'q edi), keyin `login`
    //     ning `findOne` i qaysi hisobni tanlashi tasodifga qolardi;
    //   - raqam egasi keyinchalik SMS bilan kirganda begona hisobga
    //     tushib qolishi mumkin edi.
    // Raqamni almashtirish = yangi raqam bilan qaytadan SMS orqali kirish.
    if (
      updateUserDto.phone_number !== undefined &&
      String(updateUserDto.phone_number).trim() !== String(before.phone_number)
    ) {
      throw new BadRequestException(
        "Telefon raqamni profil orqali almashtirib bo'lmaydi — yangi raqam bilan SMS kod orqali kiring",
      );
    }

    const breaks = UsersService.SESSION_BREAKING_FIELDS.some((f) => {
      const next = (updateUserDto as any)[f];
      return next !== undefined && next !== (before as any)[f];
    });

    const payload: any = { ...updateUserDto };
    // Sayt formasi to'ldirilmagan sanani `""` bilan yuboradi — bo'sh satrni
    // DATE ustuniga yozib bo'lmaydi (Sequelize xato beradi).
    if (payload.birthdate === '') payload.birthdate = null;
    // Til modelda e'lon qilinmagan (user.model.ts dagi izohga qarang) —
    // xom SQL bilan alohida yoziladi.
    const lang = payload.lang;
    delete payload.lang;
    if (breaks) {
      payload.token_version = Number(before.token_version ?? 0) + 1;
      // Eski refresh token ham ishlamasin
      payload.refresh_token = null;
    }

    const updating = await this.UsersRepository.update(payload, {
      where: { id },
      returning: true,
    });
    const langSaqlandi = lang ? await this.saveLang(id, lang) : false;
    const saqlangan: Record<string, any> = { ...updating[1][0].dataValues };
    // Faqat HAQIQATAN yozilgan bo'lsa javobga qo'shamiz (migratsiyadan
    // oldin ustun yo'q — javob yolg'on gapirmasin).
    if (langSaqlandi) saqlangan.lang = lang;
    return saqlangan;
  }

  /**
   * Til (`uz` | `ru` | `en`) — push matni shu tilda ketadi.
   * Ustun modelda yo'q, shuning uchun xom SQL. Migratsiya hali
   * ishlatilmagan bo'lsa xato jimgina yutiladi (til `uz` bo'lib qoladi).
   */
  private async saveLang(id: number, lang: string): Promise<boolean> {
    try {
      await this.UsersRepository.sequelize.query(
        'UPDATE users SET lang = :lang WHERE id = :id',
        { replacements: { id, lang } },
      );
      return true;
    } catch {
      // `users.lang` ustuni yo'q — migratsiyadan keyin ishlaydi
      return false;
    }
  }

  /** Foydalanuvchining barcha sessiyalarini bekor qiladi (adminka uchun). */
  async revokeSessions(id: number) {
    const user = await this.UsersRepository.findByPk(id);
    if (!user) throw new NotFoundException('User not found');
    await this.UsersRepository.update(
      { token_version: Number(user.token_version ?? 0) + 1, refresh_token: null },
      { where: { id } },
    );
    return { message: 'Sessiyalar bekor qilindi', user_id: id };
  }

  //Delete user by id
  async deleteUser(id: number) {
    const deleting = await this.UsersRepository.destroy({ where: { id: id } });
    if (deleting) return 'User deleted successfully';
    else throw new NotFoundException('User not found or something is wrong');
  }

  /**
   * QISQA muddatli access token.
   *
   * Sayt — 30 daqiqa, mobil — 15 daqiqa. Ilgari sayt tokeni 7 KUN yashardi
   * va localStorage'da turardi: o'g'irlangan token bir hafta ishlardi.
   * Endi sessiyani refresh token cho'zadi (sayt 6 oy, mobil 90 kun,
   * ikkisi ham sirpanuvchi), access esa tez o'ladi.
   */
  private async sessionAccessToken(user: User, client: 'web' | 'mobile') {
    return this.jwtservice.signAsync(
      {
        id: user.id,
        is_active: user.is_active,
        is_admin: user.is_admin,
        tv: Number(user.token_version ?? 0),
        client,
      },
      {
        secret: process.env.ACCESS_TOKEN_KEY_USER,
        expiresIn: client === 'mobile' ? MOBILE_ACCESS_TTL : WEB_ACCESS_TTL,
      },
    );
  }

  /**
   * MOBIL SESSIYANI YANGILASH (topshiriq №29, 3-band).
   *
   * `POST /api/users/refresh { refresh_token }`
   *   200 — yangi juftlik (refresh ALMASHADI, eskisi bekor);
   *   401 — noto'g'ri, muddati o'tgan, chiqilgan yoki qayta ishlatilgan
   *         (bu holda butun zanjir bekor qilinadi).
   *
   * Tarmoq uzilib javob yetib bormagan holat uchun 30 soniyalik imtiyoz
   * oynasi bor: xuddi o'sha refresh bilan qayta so'ralsa AYNAN o'sha
   * juftlik qaytadi va hisob "o'g'irlangan" deb yopilmaydi.
   *
   * Eski (sayt) JWT refresh tokeni ham qabul qilinadi — sayt oqimi
   * o'zgarmasin.
   */
  async refreshMobileSession(rawToken: string, meta: SessionMeta = {}) {
    const denied = new UnauthorizedException(
      'Sessiya tugagan yoki bekor qilingan — qayta kiring',
    );
    if (typeof rawToken !== 'string' || !rawToken.trim()) throw denied;
    const token = rawToken.trim();

    // ESKI sayt tokeni (JWT): tekshiriladi va sessiya JIMGINA yangi
    // ko'rinishga ko'chiriladi — foydalanuvchi qayta kirmaydi.
    if (token.split('.').length === 3) return this.upgradeLegacySession(token, meta);

    const found = await findUserRefreshToken(token);
    if (found.ok === false) throw denied;

    const user = await this.UsersRepository.findByPk(found.row.user_id);
    if (
      !user ||
      !user.is_active ||
      Number(user.token_version ?? 0) !== Number(found.row.token_version)
    ) {
      await revokeAllUserRefreshTokens(found.row.user_id);
      throw denied;
    }
    // Muddat satrda saqlanadi: mobil 90 kun, sayt 180 kun
    const kind: 'web' | 'mobile' =
      Number(found.row.ttl_days) === MOBILE_REFRESH_DAYS ? 'mobile' : 'web';
    const accessTtl = kind === 'mobile' ? MOBILE_ACCESS_TTL : WEB_ACCESS_TTL;

    // Imtiyoz oynasi: allaqachon berilgan juftlikni qaytaramiz.
    if (found.ok === 'grace') {
      return {
        accessToken: await this.sessionAccessToken(user, kind),
        refreshToken: found.replacement,
        expires_in: accessTtl,
        reused_within_grace: true,
      };
    }

    const next = await rotateUserRefreshToken(found.row, Number(user.token_version ?? 0), meta);
    if (!next) {
      // Boshqa so'rov bizdan oldin almashtirdi — o'sha juftlikni beramiz.
      const again = await findUserRefreshToken(token);
      if (again.ok === 'grace') {
        return {
          accessToken: await this.sessionAccessToken(user, kind),
          refreshToken: again.replacement,
          expires_in: accessTtl,
          reused_within_grace: true,
        };
      }
      throw denied;
    }

    return {
      accessToken: await this.sessionAccessToken(user, kind),
      refreshToken: next.raw,
      refresh_expires_at: next.row.expires_at,
      expires_in: accessTtl,
    };
  }

  /**
   * ESKI SESSIYANI KO'CHIRISH.
   *
   * Saytda kirgan foydalanuvchilarda `localStorage` da JWT refresh token
   * bor (75 kunlik, `users.refresh_token` da bcrypt xeshi). Ular relizdan
   * keyin qayta kirmasligi kerak: eski token bir marta ishlatiladi va
   * o'rniga YANGI ko'rinishdagi (bazadagi, aylanadigan, 6 oylik) sessiya
   * beriladi. Eski token esa darhol o'ladi.
   */
  private async upgradeLegacySession(token: string, meta: SessionMeta) {
    const denied = new UnauthorizedException(
      'Sessiya tugagan yoki bekor qilingan — qayta kiring',
    );
    let payload: any;
    try {
      payload = await this.jwtservice.verifyAsync(token, {
        secret: process.env.REFRESH_TOKEN_KEY_USER,
      });
    } catch {
      throw denied;
    }
    const user = await this.UsersRepository.findByPk(Number(payload?.id));
    if (!user || !user.is_active || !user.refresh_token) throw denied;
    if (Number(payload?.tv ?? 0) !== Number(user.token_version ?? 0)) throw denied;
    if (!(await bcrypt.compare(token, user.refresh_token))) throw denied;

    // Eski token qayta ishlatilmasin
    await this.UsersRepository.update({ refresh_token: null }, { where: { id: user.id } });

    const next = await issueUserRefreshToken(
      user.id,
      Number(user.token_version ?? 0),
      meta,
      WEB_REFRESH_DAYS,
    );
    return {
      accessToken: await this.sessionAccessToken(user, 'web'),
      refreshToken: next.raw,
      refresh_expires_at: next.row.expires_at,
      expires_in: WEB_ACCESS_TTL,
      upgraded: true,
    };
  }

  async signInWithOtp(phone_number: string) {
    const client = Number(
      phone_number
        .split('')
        .filter((num) => !isNaN(+num))
        .join(''),
    );

    await this.otpService.auth();

    const decoded = await this.newOtp(client);
    if (!decoded) throw new BadRequestException('An error ocured...');
    return decoded;
  }

  async newOtp(phone_number: number) {
    const fullPhone = `+${phone_number}`;
    const now = new Date();

    // Sutkalik SMS limiti (eski qatorlar endi o'chirilmaydi, shuning
    // uchun shu raqamga oxirgi 24 soatda nechta kod yuborilganini sanay olamiz)
    const sentToday = await this.otpRepo.count({
      where: {
        phone_number: fullPhone,
        createdAt: { [Op.gte]: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });
    if (sentToday >= OTP_DAILY_LIMIT) {
      throw new BadRequestException(
        "Bu raqamga sutkalik SMS limiti tugadi, ertaga qayta urinib ko'ring",
      );
    }

    // Tez-tez qayta so'rashni cheklash
    const lastOtp = await this.otpRepo.findOne({
      where: { phone_number: fullPhone },
      order: [['createdAt', 'DESC']],
    });
    if (
      lastOtp &&
      now.getTime() - lastOtp.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS
    ) {
      throw new BadRequestException(
        "Kod hozirgina yuborildi, biroz kutib qayta urinib ko'ring"
      );
    }

    // MUHIM: Number() ishlatilmaydi — aks holda "01234" kabi 0 bilan boshlangan
    // kodlar "1234" ga aylanib, tasdiqlash mumkin bo'lmay qoladi.
    const otp = otpGenerator.generate(5, {
      digits: true,
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });
    await this.otpService.sendOtp(phone_number, otp);

    const expiration_time = AddMinutesToDate(now, 5);
    // Eski qatorlar ATAYLAB o'chirilmaydi — sutkalik limitni sanash uchun kerak.
    // Tasdiqlash endi aniq shu urinishning otp_id'si bo'yicha qidiriladi
    // (verifyOtpClient), shuning uchun eski qatorlar chalkashlik keltirmaydi.
    const newOtp = await this.otpRepo.create({
      unique_id: randomUUID(),
      // Kodning O'ZI bazaga yozilmaydi — faqat xeshi (topshiriq №19, 8-band)
      otp_hash: hashOtp(otp, fullPhone),
      expiration_time,
      phone_number: fullPhone,
    });

    const details = {
      timestamp: now,
      phone_number: newOtp.phone_number,
      success: true,
      message: 'OTP sent to client',
      otp_id: newOtp.id,
    };

    const encoded = await encode(JSON.stringify(details));
    return { status: 'Sent', details: encoded };
  }

  async verifyOtpClient(
    verifyOtpDto: VerifyOtpDto,
    res: Response,
    ctx: { ip?: string; userAgent?: string } = {},
  ) {
    const { verification_key, otp, phone_number } = verifyOtpDto;
    // Versiyalar kod tekshirilishidan OLDIN tekshiriladi: eskirgan bo'lsa 409,
    // OTP urinishi behuda sarflanmaydi.
    const versions = await this.checkConsentVersions(verifyOtpDto);

    let obj: IOtpType;
    try {
      obj = JSON.parse(await decode(verification_key));
    } catch {
      throw new BadRequestException('Tasdiqlash kaliti yaroqsiz');
    }

    if (obj.phone_number != phone_number) {
      throw new BadRequestException('Tasdiqlash kodi bu raqamga yuborilmagan');
    }

    // Aniq shu urinishning OTP qatori — endi eski qatorlar o'chirilmagani
    // uchun faqat phone_number bo'yicha qidirish noaniq bo'lardi.
    const otpRow = await this.otpRepo.findOne({
      where: { id: obj.otp_id, phone_number: obj.phone_number },
    });
    if (!otpRow) {
      throw new BadRequestException('Bunday OTP mavjud emas');
    }
    const otpDB = otpRow.dataValues;

    // Tekshiruvlar — kod to'g'ri bo'lmaguncha hech narsa o'zgartirmaymiz
    if (otpDB.verified) {
      throw new BadRequestException('Tasdiqlash kodi allaqachon qabul qilingan');
    }
    if (!dates.compare(otpDB.expiration_time, new Date())) {
      throw new BadRequestException('Tasdiqlash kodi muddati tugagan');
    }
    if (otpDB.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException(
        "Noto'g'ri urinishlar soni tugadi, yangi kod so'rang",
      );
    }
    // Kod endi xesh bilan solishtiriladi (topshiriq №19, 8-band).
    // `otp_hash` bo'sh bo'lgan qatorlar — deploy paytida yo'lda qolgan eski
    // kodlar; ular tugaguncha (5 daqiqa) eskicha tekshiriladi.
    const kodTogri = otpDB.otp_hash
      ? otpMatches(String(otp), otpDB.phone_number, otpDB.otp_hash)
      : String(otpDB.otp) === String(otp);
    if (!kodTogri) {
      await this.otpRepo.increment('attempts', { where: { id: otpDB.id } });
      throw new BadRequestException('Tasdiqlash kodi xato');
    }

    // Kod to'g'ri — endi OTP ni ishlatilgan deb belgilaymiz, userni aktivlashtiramiz va token beramiz
    // Kod (va xeshi) darhol o'chiriladi: qator sutkalik limitni sanash uchun
    // qoladi, lekin ichida tekshiriladigan hech narsa qolmaydi.
    await this.makeVerifyTrue(otpDB.unique_id);
    await this.UsersRepository.update(
      { is_active: true },
      { where: { phone_number } },
    );

    const client = await this.UsersRepository.findOne({
      where: { phone_number },
    });
    if (!client) {
      throw new BadRequestException('Foydalanuvchi topilmadi');
    }

    // Rozilik dalili — raqam SMS-kod bilan tasdiqlangandan keyin (oferta 3.6
    // bilan bir xil qoida: versiya, vaqt, hisob, IP, brauzer).
    if (versions) {
      for (const [kind, version] of [['buyer', versions.terms], ['privacy', versions.privacy]] as const) {
        await this.consent.record({ kind, version, user_id: client.id, ip: ctx.ip, userAgent: ctx.userAgent });
      }
    }

    // SESSIYA (mobil ham, sayt ham bir xil mexanizm).
    //
    //   mobil — access 15 daqiqa, refresh 90 kun (topshiriq №29, 3-band);
    //   sayt  — access 30 daqiqa, refresh 180 kun (6 OY).
    //
    // Ikkisida ham refresh SIRPANUVCHI (har ishlatilganda muddat qaytadan
    // boshlanadi) va har chaqiruvda ALMASHADI. Bazada faqat SHA-256 xeshi.
    // Javob shakli o'zgarmadi: `tokens.accessToken` / `tokens.refreshToken`.
    //
    // Ilgari sayt uchun 7 KUNLIK access + 75 kunlik JWT refresh berilardi va
    // ikkisi ham localStorage'da turardi — o'g'irlangan token bir hafta
    // ishlardi, sessiyani bekor qilish esa imkonsiz edi.
    const mobil = verifyOtpDto.client === 'mobile';
    const refresh = await issueUserRefreshToken(
      client.id,
      Number(client.token_version ?? 0),
      ctx,
      mobil ? MOBILE_REFRESH_DAYS : WEB_REFRESH_DAYS,
    );
    const tokens = {
      accessToken: await this.sessionAccessToken(client, mobil ? 'mobile' : 'web'),
      refreshToken: refresh.raw,
    };
    // Eski JWT refresh (agar bor bo'lsa) endi kerak emas
    if (client.refresh_token) {
      await this.UsersRepository.update({ refresh_token: null }, { where: { id: client.id } });
    }

    if (!mobil) {
      // Brauzer uchun qo'shimcha nusxa — `httpOnly`, ya'ni JS o'qiy olmaydi.
      // Sayt asosan localStorage'dagi nusxadan foydalanadi (API boshqa
      // domenda — uchinchi tomon cookie'lari bloklanishi mumkin).
      res.cookie('refresh_token', refresh.raw, {
        maxAge: WEB_REFRESH_DAYS * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }

    return {
      client,
      tokens,
      expires_in: mobil ? MOBILE_ACCESS_TTL : WEB_ACCESS_TTL,
      refresh_expires_at: refresh.row.expires_at,
      status: 1,
    };
  }

  /**
   * `terms_version` va `privacy_version` birga keladi. Bittasi bo'lsa — 400;
   * joriy versiya emas — 409; ikkalasi ham yo'q — `null` (eskicha oqim).
   */
  private async checkConsentVersions(dto: { terms_version?: string; privacy_version?: string }) {
    const terms = dto.terms_version?.trim();
    const privacy = dto.privacy_version?.trim();
    if (!terms && !privacy) return null;
    if (!terms || !privacy) {
      throw new BadRequestException('terms_version va privacy_version birga yuborilishi kerak');
    }
    await this.consent.assertCurrent('buyer', terms);
    await this.consent.assertCurrent('privacy', privacy);
    return { terms, privacy };
  }

  async makeVerifyTrue(otp_id: string) {
    const verified = await this.otpRepo.update(
      { verified: true, otp: null, otp_hash: null },
      {
        where: {
          unique_id: otp_id,
        },
      },
    );
    if (verified) return true;
    throw new BadRequestException('Wrong one time password ...');
  }

  async getUserBadgeNumbers(id: number) {
    const likes = await this.likeRepo.count({ where: { user_id: id } });
    const carts = await this.cartRepo.findOne({
      where: { user_id: id },
      include: { all: true },
    });
    const payload = {
      likes,
      carts: carts?.cartItems,
    };
    return payload;
  }

}
