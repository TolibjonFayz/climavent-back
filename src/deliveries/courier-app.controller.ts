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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { resolveStoreSession } from 'src/store_auth/store-session';
import { resolveUserSession } from 'src/users/user-session';
import { PROOF_MAX_BYTES } from './constants';
import { CourierGuard } from './courier.guard';
import { DeliveriesService } from './deliveries.service';
import {
  CourierActionDto,
  CourierDeliverDto,
  CourierFailDto,
  CourierMeDto,
  CourierRejectDto,
  DeviceDto,
  LocationDto,
} from './dto/dto';
import { DeviceToken } from './model/models';

const photo = () => FileInterceptor('photo', { limits: { fileSize: PROOF_MAX_BYTES, files: 1 } });

/**
 * Kuryer ilovasi / telefon sahifasi (topshiriq №22, 4-band).
 * Kuryer faqat O'ZIGA biriktirilgan yetkazishni ko'radi — boshqasi 404.
 * Har amalda `lat`/`lng` ixtiyoriy — tarixga yoziladi.
 */
@ApiTags('Courier app')
@ApiBearerAuth()
@UseGuards(CourierGuard)
@Controller('courier')
export class CourierAppController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get('me')
  me(@Req() req: any) {
    return req.courier;
  }

  @ApiOperation({ summary: '"Ishdaman / ishda emasman"' })
  @Patch('me')
  async updateMe(@Body() dto: CourierMeDto, @Req() req: any) {
    await req.courier.update({ is_online: dto.is_online, last_seen_at: new Date() });
    return req.courier;
  }

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

  @HttpCode(200)
  @Post('deliveries/:id/pickup')
  pickup(@Param('id', ParseIntPipe) id: number, @Body() dto: CourierActionDto, @Req() req: any) {
    return this.deliveries.courierAction(req.courier, id, 'pickup', dto);
  }

  @ApiOperation({ summary: "Yo'lga chiqish — mijozga topshirish kodi bilan SMS" })
  @HttpCode(200)
  @Post('deliveries/:id/start')
  start(@Param('id', ParseIntPipe) id: number, @Body() dto: CourierActionDto, @Req() req: any) {
    return this.deliveries.courierAction(req.courier, id, 'start', dto);
  }

  @ApiOperation({ summary: 'Topshirish: kod YOKI rasm+izoh; cod_amount > 0 bo\'lsa cash_collected' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @Throttle({ default: { limit: 20, ttl: 60 * 1000 } })
  @UseInterceptors(photo())
  @HttpCode(200)
  @Post('deliveries/:id/deliver')
  deliver(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CourierDeliverDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.deliveries.courierDeliver(req.courier, id, dto, file);
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

  @ApiOperation({ summary: 'Joylashuv — faol yetkazish paytida 30–60 soniyada bir' })
  @Throttle({ default: { limit: 30, ttl: 60 * 1000 } })
  @HttpCode(200)
  @Post('location')
  location(@Body() dto: LocationDto, @Req() req: any) {
    return this.deliveries.location(req.courier, dto);
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
