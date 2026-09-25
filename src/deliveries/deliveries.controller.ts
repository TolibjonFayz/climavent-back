import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';
import { CouriersService } from './couriers.service';
import { DeliveriesService } from './deliveries.service';
import {
  AssignDto,
  CashHandoverDto,
  CommentDto,
  CreateCourierDto,
  CreateDeliveryDto,
  UpdateCourierDto,
  UpdateDeliveryDto,
} from './dto/dto';

/**
 * Kuryerlar — adminka (topshiriq №22, 1- va 9-band).
 * Superadmin (servis kaliti ham) — hammasi; do'kon admini — faqat o'z do'koni.
 */
@ApiTags('Couriers')
@ApiBearerAuth()
@ApiSecurity('service-key')
@UseGuards(StoreAuthGuard)
@Controller('couriers')
export class CouriersController {
  constructor(private readonly couriers: CouriersService) {}

  @ApiOperation({ summary: "Kuryer yaratish (hisob + profil + parol o'rnatish havolasi)" })
  @ApiResponse({ status: 201, schema: { example: { courier: { id: 3, full_name: 'Aziz', phone: '+998901234567', login: 'c998901234567' }, password_setup_token: '9c1e…', password_setup_expires_at: '2026-09-20T09:00:00Z' } } })
  @Post()
  create(@Body() dto: CreateCourierDto, @Req() req: any) {
    return this.couriers.create(dto, req.storeUser);
  }

  @ApiOperation({ summary: "Kuryerlar (?store_id=|null&is_active=&is_online=)" })
  @Get()
  list(
    @Req() req: any,
    @Query('store_id') store_id?: string,
    @Query('is_active') is_active?: string,
    @Query('is_online') is_online?: string,
    // `?skill=installation` — shu ishni qila oladigan ustalar (№39, 2-band)
    @Query('skill') skill?: string,
  ) {
    return this.couriers.list(req.storeUser, { store_id, is_active, is_online, skill });
  }

  @Get(':id')
  one(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.couriers.getOwned(id, req.storeUser);
  }

  @ApiOperation({ summary: "Tahrirlash; is_active=false — tokenlar bekor, faol yetkazish bo'lsa 409" })
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCourierDto, @Req() req: any) {
    return this.couriers.update(id, dto, req.storeUser);
  }

  @ApiOperation({ summary: "O'chirish = nofaol qilish (tarix saqlanadi); faol yetkazish bo'lsa 409" })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.couriers.remove(id, req.storeUser);
  }

  @ApiOperation({ summary: "Yangi parol o'rnatish havolasi" })
  @Post(':id/password-setup')
  passwordSetup(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.couriers.passwordSetup(id, req.storeUser);
  }

  @ApiOperation({ summary: "Kuryer qo'lidagi naqd pul (9-band)" })
  @ApiResponse({ status: 200, schema: { example: { courier_id: 3, collected: 3000000, handed_over: 1500000, balance: 1500000, handovers: [] } } })
  @Get(':id/cash')
  cash(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.couriers.cash(id, req.storeUser);
  }

  @ApiOperation({ summary: 'Naqd pulni qabul qilish' })
  @Post(':id/cash-handover')
  handover(@Param('id', ParseIntPipe) id: number, @Body() dto: CashHandoverDto, @Req() req: any) {
    return this.couriers.handover(id, dto, req.storeUser);
  }
}

/**
 * Yetkazishlar — adminka (topshiriq №22, 4-band).
 * Do'kon admini faqat `store_id` o'ziniki bo'lganlarini ko'radi (begonasi — 404).
 */
@ApiTags('Deliveries')
@ApiBearerAuth()
@ApiSecurity('service-key')
@UseGuards(StoreAuthGuard)
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @ApiOperation({ summary: "Yetkazish yaratish (manzil berilmasa buyurtma va do'kondan)" })
  @Post()
  create(@Body() dto: CreateDeliveryDto, @Req() req: any) {
    return this.deliveries.create(dto, req.storeUser);
  }

  @ApiOperation({ summary: 'Ro\'yxat (?status=a,b&store_id=&courier_id=|null&order_id=&date_from=&date_to=&page=&limit=)' })
  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.deliveries.list(req.storeUser, q);
  }

  @ApiOperation({ summary: 'Hisobot (10-band): jami, holatlar, sabablar, o\'rtacha vaqt, o\'z vaqtida ulushi, kuryerlar kesimi' })
  @Get('stats')
  stats(@Req() req: any, @Query() q: any) {
    return this.deliveries.stats(req.storeUser, q);
  }

  @ApiOperation({ summary: 'Bitta yetkazish: tarix, rasmlar, kuryerning oxirgi joylashuvi' })
  @Get(':id')
  one(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.deliveries.getOne(id, req.storeUser);
  }

  @ApiOperation({ summary: "Manzil, vaqt, summa — faqat pending/assigned da (aks holda 409)" })
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDeliveryDto, @Req() req: any) {
    return this.deliveries.update(id, dto, req.storeUser);
  }

  @ApiOperation({ summary: "Kuryer biriktirish (transport mos bo'lmasa 409)" })
  @HttpCode(200)
  @Post(':id/assign')
  assign(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignDto, @Req() req: any) {
    return this.deliveries.assign(id, dto.courier_id, req.storeUser);
  }

  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @Body() dto: CommentDto, @Req() req: any) {
    return this.deliveries.cancel(id, dto.comment, req.storeUser);
  }

  @ApiOperation({ summary: 'failed → returned (tovar omborga qaytdi)' })
  @HttpCode(200)
  @Post(':id/return')
  returned(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.deliveries.returned(id, req.storeUser);
  }

  @ApiOperation({ summary: 'failed → pending (qayta yetkazish)' })
  @HttpCode(200)
  @Post(':id/retry')
  retry(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.deliveries.retry(id, req.storeUser);
  }

  /**
   * Mijozga yuboriladigan kuzatish havolasi (topshiriq №24, 1-band).
   *
   * SMS shabloni Eskizda tasdiqlanmaguncha operator havolani qo'lda
   * yuboradi. Ochiq token bazada saqlanmagani uchun har chaqiruvda YANGI
   * havola yaratiladi va eskisi bekor bo'ladi.
   */
  @ApiOperation({ summary: "Kuzatish havolasi (accepted/picked_up/on_the_way; eskisi bekor bo'ladi)" })
  @ApiResponse({ status: 200, schema: { example: { url: 'https://climavent.uz/kuzatish/…', expires_at: null } } })
  @ApiResponse({ status: 409, description: 'Bu holatda havola berilmaydi' })
  @HttpCode(200)
  @Post(':id/tracking-link')
  trackingLink(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.deliveries.trackingLink(id, req.storeUser);
  }

  @ApiOperation({ summary: "Yetkazishdagi hodisalar (shikast, avariya, o'g'irlik)" })
  @Get(':id/incidents')
  incidents(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.deliveries.incidents(id, req.storeUser);
  }

  @ApiOperation({ summary: 'Isbot rasmi (guvohnoma bilan; ochiq URL yo\'q)' })
  @Get(':id/proofs/:proofId')
  async proof(
    @Param('id', ParseIntPipe) id: number,
    @Param('proofId', ParseIntPipe) proofId: number,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { proof, data } = await this.deliveries.proofFile(id, proofId, req.storeUser);
    res.setHeader('Content-Type', proof.mime);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(data);
  }
}
