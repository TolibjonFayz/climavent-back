import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TrackingService } from './tracking.service';

/**
 * Mijoz uchun OCHIQ kuzatish (topshiriq №24, 2-band).
 *
 * Guvohnoma talab qilinmaydi — SMS'dagi havola kalitning o'zi. Shuning
 * uchun:
 *   - IP bo'yicha daqiqasiga 60 so'rov (sahifa 15 soniyada yangilanadi,
 *     ya'ni 4/daq — chegara ochiq qoldirilgan bir necha tabga ham yetadi);
 *   - noto'g'ri token — 404 (bor-yo'qligi farqlanmaydi), muddati o'tgan — 410;
 *   - javob keshlanmaydi va qidiruv tizimlariga tushmaydi.
 */
@ApiTags('Tracking')
@Controller('tracking')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @ApiOperation({ summary: 'Mijoz uchun ochiq kuzatish (guvohnomasiz)' })
  @ApiResponse({ status: 404, description: "Havola noto'g'ri" })
  @ApiResponse({ status: 410, description: "Havola muddati o'tgan" })
  @Throttle({ default: { limit: 60, ttl: 60 * 1000 } })
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex')
  @Get(':token')
  track(@Param('token') token: string) {
    return this.tracking.track(token);
  }
}
