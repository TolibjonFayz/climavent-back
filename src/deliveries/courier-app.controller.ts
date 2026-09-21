import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { resolveStoreSession } from 'src/store_auth/store-session';
import { resolveUserSession } from 'src/users/user-session';
import { PROOF_MAX_BYTES } from './constants';
import { CourierGuard } from './courier.guard';
import { DeliveriesService } from './deliveries.service';
import { CourierVehiclesService } from './courier-vehicles.service';
import { CourierWorkService } from './courier-work.service';
import {
  ArrivedDto,
  CourierActionDto,
  CourierDeliverDto,
  CourierFailDto,
  CourierMeDto,
  CourierPickupDto,
  CourierRejectDto,
  CourierVehicleDto,
  DeviceDto,
  IncidentDto,
  LocationDto,
  ShiftEndDto,
  ShiftStartDto,
  UpdateCourierVehicleDto,
} from './dto/dto';
import { CourierVehicle, DeviceToken } from './model/models';

const photo = () => FileInterceptor('photo', { limits: { fileSize: PROOF_MAX_BYTES, files: 1 } });
/** Topshirishda ikkita fayl bo'lishi mumkin: rasm va imzo (topshiriq №26, 3-band). */
const deliveryFiles = () =>
  FileFieldsInterceptor(
    [
      { name: 'photo', maxCount: 1 },
      { name: 'signature', maxCount: 1 },
    ],
    { limits: { fileSize: PROOF_MAX_BYTES, files: 2 } },
  );
const incidentFiles = () =>
  FileFieldsInterceptor([{ name: 'photos', maxCount: 5 }], {
    limits: { fileSize: PROOF_MAX_BYTES, files: 5 },
  });
const vehicleFile = () =>
  FileInterceptor('registration_photo', { limits: { fileSize: PROOF_MAX_BYTES, files: 1 } });

/**
 * Kuryer ilovasi / telefon sahifasi (topshiriq №22, 4-band; №26).
 * Kuryer faqat O'ZIGA biriktirilgan yetkazishni ko'radi — boshqasi 404.
 * Har amalda `lat`/`lng` ixtiyoriy — tarixga yoziladi.
 */
@ApiTags('Courier app')
@ApiBearerAuth()
@UseGuards(CourierGuard)
@Controller('courier')
export class CourierAppController {
  constructor(
    private readonly deliveries: DeliveriesService,
    private readonly vehicles: CourierVehiclesService,
    private readonly work: CourierWorkService,
  ) {}

  @Get('me')
  async me(@Req() req: any) {
    const active = req.courier.active_vehicle_id
      ? await CourierVehicle.findByPk(req.courier.active_vehicle_id)
      : null;
    return { ...req.courier.get({ plain: true }), active_vehicle: active };
  }

  @ApiOperation({ summary: '"Ishdaman / ishda emasman" (smena ochiq bo\'lsa avtomatik)' })
  @Patch('me')
  async updateMe(@Body() dto: CourierMeDto, @Req() req: any) {
    await req.courier.update({ is_online: dto.is_online, last_seen_at: new Date() });
    return req.courier;
  }

  // ============================================================ yetkazishlar
  @ApiOperation({ summary: 'Yetkazishlarim (?scope=active|history)' })
  @Get('deliveries')
  list(@Req() req: any, @Query('scope') scope?: string) {
    return this.deliveries.courierList(req.courier, scope === 'history' ? 'history' : 'active');
  }

  @Get('deliveries/:id')
  one(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.deliveries.courierOne(req.courier, id);
  }

  @HttpCode(200)
  @Post('deliveries/:id/accept')
  accept(@Param('id', ParseIntPipe) id: number, @Body() dto: CourierActionDto, @Req() req: any) {
    return this.deliveries.courierAction(req.courier, id, 'accept', dto);
  }

  @ApiOperation({ summary: 'Rad etish — sabab (comment) majburiy' })
  @HttpCode(200)
  @Post('deliveries/:id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: CourierRejectDto, @Req() req: any) {
    return this.deliveries.courierAction(req.courier, id, 'reject', dto);
  }

  @ApiOperation({
    summary: "Olib ketish: items_checked (hammasi) va rasm (van/truck da majburiy)",
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(photo())
  @HttpCode(200)
  @Post('deliveries/:id/pickup')
  pickup(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CourierPickupDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.deliveries.courierPickup(req.courier, id, dto, file);
  }

  @ApiOperation({ summary: "Yo'lga chiqish — mijozga kuzatish havolasi va kod bilan SMS" })
  @HttpCode(200)
  @Post('deliveries/:id/start')
  start(@Param('id', ParseIntPipe) id: number, @Body() dto: CourierActionDto, @Req() req: any) {
    return this.deliveries.courierAction(req.courier, id, 'start', dto);
  }

  @ApiOperation({ summary: 'Manzilga yetib keldim (SMS ketmaydi, kutish vaqti shundan sanaladi)' })
  @HttpCode(200)
  @Post('deliveries/:id/arrived')
  arrived(@Param('id', ParseIntPipe) id: number, @Body() dto: ArrivedDto, @Req() req: any) {
    return this.deliveries.courierArrived(req.courier, id, dto);
  }

  @ApiOperation({ summary: "Qo'ng'iroq urinishi (mijoz javob bermadi)" })
  @HttpCode(200)
  @Post('deliveries/:id/call-attempt')
  callAttempt(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.deliveries.courierCallAttempt(req.courier, id);
  }

  @ApiOperation({
    summary: "Topshirish: kod YOKI rasm + (imzo yoki ism va izoh); cod_amount > 0 bo'lsa cash_collected",
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @Throttle({ default: { limit: 20, ttl: 60 * 1000 } })
  @UseInterceptors(deliveryFiles())
  @HttpCode(200)
  @Post('deliveries/:id/deliver')
  deliver(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CourierDeliverDto,
    @UploadedFiles() files: { photo?: Express.Multer.File[]; signature?: Express.Multer.File[] },
    @Req() req: any,
  ) {
    return this.deliveries.courierDeliver(req.courier, id, dto, files?.photo?.[0], files?.signature?.[0]);
  }

  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(photo())
  @HttpCode(200)
  @Post('deliveries/:id/fail')
  fail(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CourierFailDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.deliveries.courierFail(req.courier, id, dto, file);
  }

  @ApiOperation({ summary: "Hodisa: shikast, avariya, o'g'irlik (holat o'zgarmaydi)" })
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(incidentFiles())
  @HttpCode(201)
  @Post('deliveries/:id/incident')
  incident(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IncidentDto,
    @UploadedFiles() files: { photos?: Express.Multer.File[] },
    @Req() req: any,
  ) {
    return this.deliveries.courierIncident(req.courier, id, dto, files?.photos || []);
  }

  @ApiOperation({ summary: "Joylashuv — on_the_way da 15 soniyada bir (heading/speed bilan)" })
  @Throttle({ default: { limit: 30, ttl: 60 * 1000 } })
  @HttpCode(200)
  @Post('location')
  location(@Body() dto: LocationDto, @Req() req: any) {
    return this.deliveries.location(req.courier, dto);
  }

  // ============================================================ "Mening transportim" (№26, 1a-band)
  @ApiOperation({ summary: 'Transportlarim' })
  @Get('vehicles')
  listVehicles(@Req() req: any) {
    return this.vehicles.list(req.courier);
  }

  @ApiOperation({ summary: "Transport qo'shish — do'kon tasdiqlagunicha `pending`" })
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(vehicleFile())
  @Post('vehicles')
  addVehicle(@Body() dto: CourierVehicleDto, @Req() req: any) {
    return this.vehicles.add(req.courier, dto, {
      actor: { type: 'courier', id: req.courier.store_user_id },
    });
  }

  @ApiOperation({ summary: "Tahrirlash — faqat pending/rejected (tasdiqlangani o'zgarmaydi)" })
  @Patch('vehicles/:id')
  updateVehicle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourierVehicleDto,
    @Req() req: any,
  ) {
    return this.vehicles.update(req.courier, id, dto);
  }

  @ApiOperation({ summary: "Arxivga olish; faol transport bo'lsa 409" })
  @Delete('vehicles/:id')
  removeVehicle(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.vehicles.archive(req.courier, id, {
      type: 'courier',
      id: req.courier.store_user_id,
    });
  }

  @ApiOperation({ summary: 'Faol transportni tanlash (faqat approved; yo\'ldagi yetkazish bo\'lsa 409)' })
  @ApiResponse({ status: 409, description: "Tasdiqlanmagan, guvohnoma toifasi mos emas yoki faol yetkazish bor" })
  @HttpCode(200)
  @Post('vehicles/:id/activate')
  activateVehicle(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.vehicles.activate(req.courier, id, {
      type: 'courier',
      id: req.courier.store_user_id,
    });
  }

  // ============================================================ smena va daromad (№26, 6-, 8-band)
  @ApiOperation({ summary: 'Smenani boshlash — transport tanlanadi, is_online avtomatik' })
  @HttpCode(200)
  @Post('shift/start')
  startShift(@Body() dto: ShiftStartDto, @Req() req: any) {
    return this.work.startShift(req.courier, dto);
  }

  @ApiOperation({ summary: "Smenani yopish — faol yetkazish bo'lsa 409" })
  @HttpCode(200)
  @Post('shift/end')
  endShift(@Body() dto: ShiftEndDto, @Req() req: any) {
    return this.work.endShift(req.courier, dto);
  }

  @Get('shifts')
  shifts(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.work.shifts(req.courier, { from, to });
  }

  @ApiOperation({ summary: 'Daromadim (?period=today|week|month)' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        delivered: 12,
        failed: 1,
        fees_total: 360000,
        cash_collected: 2400000,
        cash_handed_over: 2000000,
        cash_balance: 400000,
        days: [{ date: '2026-09-21', delivered: 4, fees: 120000 }],
      },
    },
  })
  @Get('earnings')
  earnings(@Req() req: any, @Query('period') period?: string) {
    return this.work.earnings(req.courier, period || 'today');
  }
}

/**
 * Push qurilmalari (topshiriq №22, 7-band). Egasi — tokendan: do'kon/kuryer
 * hisobi (`store_user`) yoki mijoz (`user`).
 */
@ApiTags('Devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly jwt: JwtService) {}

  private async owner(req: any): Promise<{ type: 'store_user' | 'user'; id: number }> {
    const [bearer, token] = String(req.headers?.authorization || '').split(' ');
    if (bearer !== 'Bearer' || !token) throw new UnauthorizedException('Token yuborilmadi');
    try {
      const p = await this.jwt.verifyAsync(token, { secret: process.env.STORE_TOKEN_KEY || process.env.ACCESS_TOKEN_KEY });
      const s = await resolveStoreSession(p);
      if (s?.user_id) return { type: 'store_user', id: s.user_id };
    } catch {
      /* mijoz tokeni sinaladi */
    }
    try {
      const p = await this.jwt.verifyAsync(token, { secret: process.env.ACCESS_TOKEN_KEY_USER });
      const u = await resolveUserSession(p);
      if (u) return { type: 'user', id: u.id };
    } catch {
      /* pastda */
    }
    throw new UnauthorizedException('Token yaroqsiz yoki sessiya bekor qilingan');
  }

  @ApiOperation({ summary: "Qurilmani ro'yxatdan o'tkazish (token boshqa egada bo'lsa — ko'chadi)" })
  @Post()
  async register(@Body() dto: DeviceDto, @Req() req: any) {
    const o = await this.owner(req);
    const existing = await DeviceToken.findOne({ where: { token: dto.token } });
    if (existing) {
      await existing.update({ owner_type: o.type, owner_id: o.id, platform: dto.platform, last_used_at: new Date() });
      return { id: existing.id, platform: existing.platform };
    }
    const row = await DeviceToken.create({ owner_type: o.type, owner_id: o.id, platform: dto.platform, token: dto.token } as any);
    return { id: row.id, platform: row.platform };
  }

  @Delete(':token')
  async remove(@Param('token') token: string, @Req() req: any) {
    const o = await this.owner(req);
    const n = await DeviceToken.destroy({ where: { token, owner_type: o.type, owner_id: o.id } });
    if (!n) throw new NotFoundException('Qurilma topilmadi');
    return { removed: true };
  }
}
