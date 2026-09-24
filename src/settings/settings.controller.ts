import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateUsdRateDto, UpdateUsdRateAutoDto } from './dto/update-usd-rate.dto';
import { BackofficeSuperadminGuard } from 'src/guards/backoffice_superadmin.guard';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // Ochiq: storefront narxni so'mda ko'rsatish uchun kursni o'qiydi.
  // Bu maxfiy ma'lumot emas — narxlar baribir saytda ko'rinadi.
  @ApiOperation({ summary: 'Get USD rate' })
  @Get('usd-rate')
  async getUsdRate() {
    return this.settingsService.getUsdRate();
  }

  // Servis kaliti (bot), sayt admini yoki do'kon panelining SUPERADMINI
  // (topshiriq №37, 1-qism: avval `store-auth` tokeni 401 olardi). Do'kon
  // admini va xodim — 403. Tarixga `actor` = token egasining logini.
  // Qo'lda yangilash topshiriq №19, 3-bandda ham saqlanib qoldi: avtomatik
  // manba ishlamay qolsa, kursni qo'lda qo'yish imkoni yo'qolmasin.
  @ApiOperation({ summary: "Kursni qo'lda o'rnatish (superadmin/bot)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiResponse({ status: 403, description: "Do'kon admini / xodim" })
  @UseGuards(BackofficeSuperadminGuard)
  @Patch('usd-rate')
  async updateUsdRate(@Body() dto: UpdateUsdRateDto, @Req() req: any) {
    return this.settingsService.updateUsdRate(dto.rate, {
      source: 'manual',
      actor: this.actor(req),
      ip: req.ip,
    });
  }

  /**
   * Adminkadagi «Bank kursini qo'yish» tugmasi (topshiriq №20, 3-band).
   *
   * Asosiy yo'l — kunlik avtomatik yangilanish (`UsdRateJobs`). Bu endpoint
   * zaxira: cron ishlamay qolsa yoki kurs kun o'rtasida shoshilinch kerak
   * bo'lsa. Markaziy bank javob bermasa 503 qaytadi va ESKI KURS QOLADI.
   */
  @ApiOperation({ summary: "Kursni Markaziy bankdan olib qo'yish (admin)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiResponse({ status: 200, schema: { example: { rate: 12185, changed: true } } })
  @ApiResponse({ status: 503, description: 'Markaziy bank javob bermadi — eski kurs qoldi' })
  @UseGuards(BackofficeSuperadminGuard)
  @HttpCode(200)
  @Post('usd-rate/refresh')
  async refreshUsdRate(@Req() req: any) {
    return this.settingsService.refreshUsdRateFromCbu({
      source: 'manual',
      actor: this.actor(req),
      ip: req.ip,
    });
  }

  /**
   * Kursni har kuni avtomatik yangilash galochkasi (topshiriq №27).
   *
   * O'qish — servis kaliti yoki superadmin (adminka Sozlamalar kartasi);
   * yozish — FAQAT superadmin: kurs butun maydoncha narxiga ta'sir qiladi,
   * do'kon admini uni yoqib qo'ya olmaydi (403).
   */
  @ApiOperation({ summary: "Avtomatik yangilash yoqilganmi (superadmin)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiResponse({ status: 200, schema: { example: { enabled: false, updated_at: '2026-09-21T10:00:00.000Z', updated_by: 'superadmin' } } })
  @UseGuards(BackofficeSuperadminGuard)
  @Get('usd-rate/auto')
  async getAutoUpdate() {
    return this.settingsService.getAutoUpdate();
  }

  @ApiOperation({ summary: "Avtomatik yangilashni yoqish/o'chirish (superadmin)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiResponse({ status: 200, schema: { example: { enabled: true, updated_at: '2026-09-21T10:00:00.000Z', updated_by: 'superadmin' } } })
  @ApiResponse({ status: 403, description: "Do'kon admini yoqa olmaydi" })
  @UseGuards(BackofficeSuperadminGuard)
  @Patch('usd-rate/auto')
  async setAutoUpdate(@Body() dto: UpdateUsdRateAutoDto, @Req() req: any) {
    return this.settingsService.setAutoUpdate(dto.enabled, {
      actor: this.actor(req),
      ip: req.ip,
    });
  }

  /**
   * Kurs nechta mahsulotga ta'sir qiladi (topshiriq №37): faqat USD narxlilar.
   * Adminka kurs sahifasida "Kurs faqat dollardagi N ta mahsulotga ta'sir qiladi".
   */
  @ApiOperation({ summary: "Kurs ta'sir qiladigan mahsulotlar soni (superadmin)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiResponse({ status: 200, schema: { example: { usd_products: 150, uzs_products: 27 } } })
  @UseGuards(BackofficeSuperadminGuard)
  @Get('usd-rate/impact')
  async impact() {
    return this.settingsService.rateImpact();
  }

  /** Kim, qachon, qaysi qiymatdan qaysisiga o'zgartirgan (topshiriq №19, 3-band). */
  @ApiOperation({ summary: 'Kurs o\'zgarishlari tarixi (admin)' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(BackofficeSuperadminGuard)
  @Get('usd-rate/history')
  async history(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.settingsService.rateHistory({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** Jurnalga yoziladigan "kim" — servis kaliti bo'lsa hisob yo'q. */
  private actor(req: any): string {
    if (req.user?.id) return `user:${req.user.id}`;
    if (req.storeUser?.login) return req.storeUser.login;
    return 'service-key';
  }
}
