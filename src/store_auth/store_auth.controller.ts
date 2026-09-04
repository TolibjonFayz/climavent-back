import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
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

@ApiTags('Store auth')
@Controller('store-auth')
export class StoreAuthController {
  constructor(private readonly storeAuthService: StoreAuthService) {}

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
  async login(@Body() dto: StoreLoginDto) {
    return this.storeAuthService.login(dto);
  }

  // Token stateless (JWT) — server tomonda saqlanmaydi, shuning uchun
  // chiqish mijoz tomonda tokenni o'chirish bilan bo'ladi. Endpoint
  // shartnoma to'liq bo'lsin deb qoldirilgan.
  @ApiOperation({ summary: 'Chiqish' })
  @ApiResponse({ status: 201, schema: { example: { message: 'Chiqildi' } } })
  @Post('logout')
  async logout() {
    return { message: 'Chiqildi' };
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
