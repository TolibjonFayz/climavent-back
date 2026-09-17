import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { StoreAuthService } from './store_auth.service';
import { StoreLoginDto } from './dto/store-login.dto';
import { StoreAuthGuard } from './store_auth.guard';
import { PasswordSetupService } from './password-setup.service';
import { SetPasswordDto } from './dto/set-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { journal, listLogins, metaOf } from './login-journal';
import { resolveStoreSession } from './store-session';

@ApiTags('Store auth')
@Controller('store-auth')
export class StoreAuthController {
  constructor(
    private readonly storeAuthService: StoreAuthService,
    private readonly passwordSetup: PasswordSetupService,
    private readonly jwtService: JwtService,
  ) {}

  // Bir martalik havola orqali parol o'rnatish (topshiriq №16, 7-band).
  // Guvohnomasiz: havolaning o'zi guvohnoma. Token taxmin qilishga qarshi
  // IP boshiga daqiqasiga 10 urinish.
  @ApiOperation({ summary: "Parolni bir martalik havola orqali o'rnatish" })
  @ApiResponse({ status: 200, schema: { example: { login: 'aircool' } } })
  @ApiResponse({ status: 400, description: "Parol 8 belgidan qisqa" })
  @ApiResponse({ status: 410, description: "Token yo'q, ishlatilgan yoki muddati o'tgan" })
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  @HttpCode(200)
  @Post('set-password')
  async setPassword(@Body() dto: SetPasswordDto, @Req() req: any) {
    return this.passwordSetup.setPassword(dto.token, dto.password, metaOf(req));
  }

  // Parol tanlash hujumiga qarshi qattiq cheklov: IP boshiga soatiga 10 ta.
  @ApiOperation({ summary: "Do'kon paneliga kirish" })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        token: 'eyJhbGciOi...',
        role: 'store_admin',
        store: { id: 2, name: 'Jihozvent', slug: 'jihozvent' },
        user: { id: 1, login: 'jihozvent_admin', full_name: 'Anvar Karimov' },
      },
    },
  })
  @ApiResponse({ status: 401, description: "Login yoki parol noto'g'ri" })
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  @Post('login')
  async login(@Body() dto: StoreLoginDto, @Req() req: any) {
    return this.storeAuthService.login(dto, metaOf(req));
  }

  // Token stateless (JWT) — server tomonda saqlanmaydi, shuning uchun
  // chiqish mijoz tomonda tokenni o'chirish bilan bo'ladi. Endpoint
  // shartnoma to'liq bo'lsin deb qoldirilgan.
  @ApiOperation({ summary: 'Chiqish' })
  @ApiResponse({ status: 201, schema: { example: { message: 'Chiqildi' } } })
  //
  // Token yuborilsa va yaroqli bo'lsa — jurnalga `logout` yoziladi (№21, 2-band).
  // Tokensiz yoki yaroqsiz token bilan ham 201: chiqish hech qachon xato bermasin.
  @Post('logout')
  async logout(@Req() req: any) {
    const [bearer, token] = String(req.headers?.authorization || '').split(' ');
    if (bearer === 'Bearer' && token) {
      try {
        const payload = await this.jwtService.verifyAsync(token, {
          secret: process.env.STORE_TOKEN_KEY || process.env.ACCESS_TOKEN_KEY,
        });
        const session = await resolveStoreSession(payload);
        if (session?.user_id) {
          await journal('logout', { store_user_id: session.user_id, login: session.login }, metaOf(req));
        }
      } catch {
        // yaroqsiz token — jurnalga yozilmaydi
      }
    }
    return { message: 'Chiqildi' };
  }

  /**
   * Parolni o'zi almashtirish (topshiriq №21, 1-band).
   * 401 — joriy parol noto'g'ri; 400 — yangi parol qisqa yoki joriysi bilan bir xil;
   * 429 — 15 daqiqada 5 ta noto'g'ri urinish. Javobda joriy sessiya uchun YANGI token:
   * boshqa qurilmalardagi sessiyalar bekor bo'ladi, bu sessiya davom etadi.
   */
  @ApiOperation({ summary: "Parolni o'zi almashtirish (do'kon yoki superadmin tokeni)" })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, schema: { example: { token: 'eyJhbGciOi...' } } })
  @ApiResponse({ status: 401, description: "Joriy parol noto'g'ri" })
  @ApiResponse({ status: 400, description: "Yangi parol 8 belgidan qisqa yoki joriysi bilan bir xil" })
  @ApiResponse({ status: 429, description: "15 daqiqada 5 ta noto'g'ri urinish" })
  @UseGuards(StoreAuthGuard)
  @HttpCode(200)
  @Post('change-password')
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: any) {
    return this.storeAuthService.changePassword(
      req.storeUser?.user_id,
      dto.current_password,
      dto.new_password,
      metaOf(req),
    );
  }

  /** O'z hisobining kirishlar jurnali (№21, 2-band), yangidan eskiga. */
  @ApiOperation({ summary: "O'z kirishlar jurnali (limit standart 20, maks 100)" })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, schema: { example: [{ event: 'login_success', ip: '213.230.78.137', user_agent: 'Mozilla/5.0 …', created_at: '2026-09-17T05:00:00Z' }] } })
  @UseGuards(StoreAuthGuard)
  @Get('logins')
  async myLogins(@Req() req: any, @Query('limit') limit?: string) {
    if (!req.storeUser?.user_id) return [];
    return listLogins(req.storeUser.user_id, limit ? Number(limit) : undefined);
  }

  @ApiOperation({ summary: 'Joriy hisob va uning do\'koni' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Hisob topildi' })
  @ApiResponse({ status: 401, description: 'Token yaroqsiz' })
  @UseGuards(StoreAuthGuard)
  @Get('me')
  async me(@Req() req: any) {
    // SERVICE_API_KEY bilan kelinsa hisob yozuvi yo'q — superadmin deb
    // qaytaramiz.
    if (!req.storeUser?.user_id) {
      return { role: 'superadmin', store: null, user: null };
    }
    return this.storeAuthService.me(req.storeUser.user_id);
  }
}
