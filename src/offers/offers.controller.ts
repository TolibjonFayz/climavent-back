import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ConsentService, OfferKind } from './consent.service';
import { AcceptOfferDto } from './dto/accept-offer.dto';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';
import { SuperadminGuard } from 'src/store_auth/superadmin.guard';

/**
 * Oferta/siyosatni TASDIQLASH va dalillarni o'qish.
 *
 * `GET /offers/current` boshqa controllerda (sotuvchi arizasi moduli) —
 * u guvohnomasiz, bu yerdagilar esa guvohnoma bilan.
 */
@ApiTags('Offers')
@Controller('offers')
export class OfferConsentController {
  constructor(private readonly consent: ConsentService) {}

  /**
   * Yangi versiyani tasdiqlash (topshiriq №20, 2-band; oferta 12.3).
   *
   * Do'kon hisobi tokeni bilan. Superadmin ham chaqira oladi (uning uchun
   * majburiy emas, lekin taqiqlanmagan ham).
   */
  @ApiOperation({ summary: 'Joriy versiyani qabul qilish (do\'kon hisobi)' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, schema: { example: { accepted: true, kind: 'seller', version: '1.0' } } })
  @ApiResponse({ status: 409, description: 'Versiya joriy emas — sahifani yangilang' })
  @UseGuards(StoreAuthGuard)
  @HttpCode(200)
  @Post('accept')
  async accept(@Body() dto: AcceptOfferDto, @Req() req: any) {
    // Yuborilgan versiya joriy bo'lmasa — 409 (sahifa ochiq qolib ketgan).
    const offer = await this.consent.assertCurrent(dto.kind as OfferKind, dto.version);

    await this.consent.record({
      kind: dto.kind as OfferKind,
      version: offer.version,
      store_user_id: req.storeUser?.user_id ?? null,
      store_id: req.storeUser?.store_id ?? null,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { accepted: true, kind: dto.kind, version: offer.version };
  }

  /**
   * Rozilik dalillari (topshiriq №19, 6-band) — faqat superadmin.
   * Nizo chiqqanda "kim, qachon, qaysi versiyani, qaysi IP dan" kerak bo'ladi.
   */
  @ApiOperation({ summary: 'Rozilik yozuvlari (superadmin)' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiQuery({ name: 'kind', required: false, example: 'buyer' })
  @ApiQuery({ name: 'user_id', required: false })
  @ApiQuery({ name: 'store_id', required: false })
  @ApiQuery({ name: 'store_user_id', required: false })
  @ApiQuery({ name: 'application_id', required: false })
  @ApiQuery({ name: 'version', required: false })
  @ApiQuery({ name: 'page', required: false })
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @Get('acceptances')
  async acceptances(
    @Query('kind') kind?: string,
    @Query('user_id') user_id?: string,
    @Query('store_id') store_id?: string,
    @Query('store_user_id') store_user_id?: string,
    @Query('application_id') application_id?: string,
    @Query('version') version?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const num = (v?: string) => (v === undefined || v === '' ? undefined : Number(v));
    return this.consent.list({
      kind,
      version,
      user_id: num(user_id),
      store_id: num(store_id),
      store_user_id: num(store_user_id),
      application_id: num(application_id),
      page: num(page),
      limit: num(limit),
    });
  }
}
