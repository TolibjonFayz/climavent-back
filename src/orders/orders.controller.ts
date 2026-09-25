import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  Delete,
  HttpCode,
  UseGuards,
  Query,
  Req,
  Header,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Order } from './model/order.model';
import { AdminOrStoreGuard } from 'src/guards/admin_or_store.guard';
import { scopedStoreId } from 'src/common/helpers/store-scope';
import { UserGuard } from 'src/guards/user.guard';
import { UserSelfGuard } from 'src/guards/user_self.guard';
import { UserSelfOrBackofficeGuard } from 'src/guards/user_self_or_backoffice.guard';
import { CustomerOrBackofficeGuard } from 'src/guards/customer_or_backoffice.guard';
import { QuotesService, quoteSender } from './quotes.service';
import { AcceptQuoteDto, RejectQuoteDto, SendQuoteDto } from './dto/quote.dto';
import { StageDto } from './dto/stage.dto';

/**
 * Kuzatish so'rovi chegarasi — FOYDALANUVCHI bo'yicha daqiqasiga 30 ta
 * (№38, 2-band). Ilova ochiq ekranda 15 soniyada bir so'raydi (4/daq), bu
 * zaxira bilan yetadi. Xotirada (bitta replika — chat xonalari kabi).
 */
const TRACK_LIMIT = 30;
const TRACK_WINDOW_MS = 60 * 1000;
const trackHits = new Map<number, number[]>();
function trackRateLimit(userId: number) {
  const now = Date.now();
  const hits = (trackHits.get(userId) || []).filter((t) => now - t < TRACK_WINDOW_MS);
  if (hits.length >= TRACK_LIMIT) {
    throw new HttpException("Juda ko'p so'rov — biroz kuting", HttpStatus.TOO_MANY_REQUESTS);
  }
  hits.push(now);
  trackHits.set(userId, hits);
  if (trackHits.size > 10000) {
    for (const [k, v] of trackHits) if (!v.some((t) => now - t < TRACK_WINDOW_MS)) trackHits.delete(k);
  }
}

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly quotes: QuotesService,
  ) {}

  //Create order — foydalanuvchi login qilgan bo'lishi kerak
  @ApiOperation({ summary: 'Creating order' })
  @UseGuards(UserGuard)
  @Post('create')
  async create(@Body() createOrderDto: CreateOrderDto, @Req() req: any) {
    return this.ordersService.createOrder(createOrderDto, req.user);
  }

  //Get all orders — admin JWT yoki servis kaliti (X-API-Key).
  //Servis kalitiga FAQAT o'qish berilgan: yozish endpointlari admin/user
  //guvohnomasida qoladi. Bu adminka daromad analitikasi uchun kerak.
  // Do'kon tokeni ham qabul qilinadi — u holda faqat o'sha do'kon
  // mahsuloti bor buyurtmalar qaytadi (topshiriq №13, 6-band).
  @ApiOperation({
    summary: "Get all orders (servis kaliti, admin yoki do'kon tokeni)",
  })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(AdminOrStoreGuard)
  @Get('all')
  async getAll(
    @Req() req: any,
    @Query('kind') kind?: string,
    @Query('source') source?: string,
    @Query('stage') stage?: string,
  ): Promise<Order[]> {
    // `?kind=quote` — faqat KP so'rovlari, `?kind=order` — oddiy buyurtmalar (№21)
    // `?source=site_kp` — faqat saytda chiqarilgan KP lar (№28)
    // `?stage=waiting|packing|ready` — yig'ish holati (№38); javobda `stage`/`stages`
    return this.ordersService.getAllOrders(scopedStoreId(req), kind, source, stage);
  }

  /**
   * Yig'ish bosqichi (topshiriq №38, 1-band). Do'kon admini / `orders.edit`
   * xodimi — o'z qismi; superadmin — istalgani. `packing`/`ready` buyurtma
   * holati shundan AVTOMATIK (qo'lda `PATCH update` — 400).
   */
  @ApiOperation({ summary: "Yig'ish holati: waiting→packing→ready (ready→packing — xato bosilganda)" })
  @ApiResponse({ status: 403, description: "Boshqa do'kon qismi" })
  @ApiResponse({ status: 409, description: "O'tish mumkin emas / bekor / KP qabul qilinmagan / kuryer olib ketgan" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(AdminOrStoreGuard)
  @Patch(':id/stores/:storeId/stage')
  async setStage(
    @Param('id', ParseIntPipe) id: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Body() dto: StageDto,
    @Req() req: any,
  ) {
    const su = req.storeUser;
    const requester =
      su?.role === 'store_admin'
        ? su
        : { role: 'superadmin' as const, store_id: null, user_id: su?.user_id ?? null };
    return this.ordersService.setStoreStage(id, storeId, dto.stage, requester);
  }

  /**
   * Ilova ichida kuzatish (topshiriq №38, 2-band; №39, 8-band) — faqat
   * buyurtma EGASI (sayt admini ham). Begona buyurtma — 404.
   */
  @ApiOperation({ summary: "Buyurtmani kuzatish: bosqichlar, do'kon qismlari, yetkazish va ishlar" })
  @ApiResponse({ status: 404, description: "Topilmadi yoki begona buyurtma" })
  @ApiResponse({ status: 429, description: 'Daqiqasiga 30 tadan ko\'p' })
  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Header('Cache-Control', 'no-store')
  @Get(':id/tracking')
  async tracking(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    trackRateLimit(Number(req.user?.id));
    return this.ordersService.tracking(id, req.user);
  }

  //Get order by id
  @ApiOperation({ summary: 'Get order by id' })
  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Get('one/:id')
  async getOne(@Param('id', ParseIntPipe) id: number, @Req() req: any): Promise<Order> {
    return this.ordersService.getOrderById(id, req.user);
  }

  //Get order by user id — foydalanuvchi faqat o'zinikini ko'radi
  @ApiOperation({ summary: 'Get order by user id' })
  @ApiBearerAuth()
    // Mijozning o'zi YOKI orqa ofis (servis kaliti, sayt admini) —
  // adminkaning mijoz sahifasi uchun (topshiriq №13, 1-band).
  @ApiSecurity('service-key')
  @UseGuards(UserSelfOrBackofficeGuard)
  @Get('oneuser/:id')
  async getOneByUserId(@Param('id', ParseIntPipe) id: number): Promise<Order[]> {
    return this.ordersService.getOrderByUserId(id);
  }

  // Update order by id — MIJOZ (egasi), SUPERADMIN yoki DO'KON ADMINI
  // (topshiriq №14, 2-band). Ilgari faqat mijoz JWT'si o'tardi, ya'ni
  // buyurtma holatini faqat xaridorning o'zi o'zgartira olardi — bu
  // mantiqan teskari edi.
  //
  // Do'kon admini aralash buyurtmaga tega olmaydi: batafsil qoida
  // `orders.service.ts` -> `ensureCanWrite`.
  @ApiOperation({
    summary: "Update order by id (egasi, superadmin yoki do'kon admini)",
  })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(CustomerOrBackofficeGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderDto: UpdateOrderDto,
    @Req() req: any,
  ) {
    return this.ordersService.updateOrderById(id, updateOrderDto, req.actor);
  }

  // Delete order by id — update bilan bir xil qoida.
  @ApiOperation({
    summary: "Delete order by id (egasi, superadmin yoki do'kon admini)",
  })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(CustomerOrBackofficeGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.ordersService.deleteOrderById(id, req.actor);
  }

  // ============================================================ KP oqimi (topshiriq №25)

  /**
   * Sotuvchi narx taklifini yuboradi (2-band).
   *
   * Aralash buyurtmada do'kon admini FAQAT o'z qatorlariga narx qo'yadi
   * (begona `order_item_id` — 403), va o'z qatorlarining HAMMASIGA:
   * yarim KP mijozga hech narsa aytmaydi.
   *
   * Qayta yuborish — yangi versiya; eskisi o'zgarmaydi (nizo dalili).
   */
  @ApiOperation({ summary: "KP yuborish (do'kon admini — o'z qatorlari, superadmin)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(AdminOrStoreGuard)
  @Put(':id/quote')
  async sendQuote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendQuoteDto,
    @Req() req: any,
  ) {
    return this.quotes.send(id, dto, quoteSender(req));
  }

  /**
   * Savatdan olingan KP ning v1 versiyasi (topshiriq №28).
   *
   * Odatda `POST /orders/create` da `source: "site_kp"` va `items` bilan
   * avtomatik yaratiladi. Bu endpoint — qatorlar alohida
   * (`order-items/create`) qo'shilgan holat uchun zaxira yo'l.
   */
  @ApiOperation({ summary: 'Saytdagi KP ni darhol chiqarish (v1)' })
  @ApiResponse({ status: 409, description: 'KP allaqachon yaratilgan yoki holat mos emas' })
  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @HttpCode(200)
  @Post(':id/quote/issue')
  async issueQuote(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    // Egalik tekshiruvi: begona buyurtma — 404
    await this.ordersService.getOrderById(id, req.user);
    return this.quotes.issueSiteQuote(id, req.user);
  }

  /** Mijoz KP ni qabul qiladi — so'rov oddiy buyurtmaga aylanadi (3-band). */
  @ApiOperation({ summary: 'KP ni qabul qilish (buyurtma egasi)' })
  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @HttpCode(200)
  @Post(':id/quote/accept')
  async acceptQuote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AcceptQuoteDto,
    @Req() req: any,
  ) {
    return this.quotes.accept(id, dto, req.user);
  }

  @ApiOperation({ summary: 'KP ni rad etish (buyurtma egasi)' })
  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @HttpCode(200)
  @Post(':id/quote/reject')
  async rejectQuote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectQuoteDto,
    @Req() req: any,
  ) {
    return this.quotes.reject(id, dto, req.user);
  }

  @ApiOperation({ summary: "Eskirgan KP o'rniga yangisini so'rash (buyurtma egasi)" })
  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @HttpCode(200)
  @Post(':id/quote/request-again')
  async requestQuoteAgain(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.quotes.requestAgain(id, req.user);
  }

  // Adminka: buyurtma + yetkazishlari (topshiriq №22, 4-band). Mijoz uchun `one/:id`.
  // DIQQAT: bu marshrut ENG OXIRIDA turadi — aks holda `all` ham `:id` deb o'qilardi.
  @ApiOperation({
    summary: "Narxsiz modellarga talab: qaysi modelga necha marta KP olingan (№28)",
  })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(AdminOrStoreGuard)
  @Get('quote-stats/unpriced')
  async unpricedDemand(@Req() req: any) {
    return this.quotes.unpricedDemand(scopedStoreId(req));
  }

  @ApiOperation({ summary: "KP hisoboti: javob vaqti, KP -> buyurtma ulushi, do'konlar kesimi" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(AdminOrStoreGuard)
  @Get('quote-stats')
  async quoteStats(@Req() req: any, @Query() q: any) {
    return this.quotes.stats(scopedStoreId(req), q);
  }

  @ApiOperation({ summary: "Buyurtma va yetkazishlari (servis kaliti, admin yoki do'kon tokeni)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(AdminOrStoreGuard)
  @Get(':id')
  async getForBackoffice(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.ordersService.getOrderForBackoffice(id, scopedStoreId(req));
  }
}
