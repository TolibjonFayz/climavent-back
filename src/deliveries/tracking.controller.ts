import { Controller, Get, Param, NotFoundException, GoneException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeliveriesService } from './deliveries.service';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Tracking')
@Controller('tracking')
export class TrackingController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @ApiOperation({ summary: 'Mijoz uchun ochiq kuzatish (topshiriq №24)' })
  @Throttle({ default: { limit: 60, ttl: 60 * 1000 } })
  @Get(':token')
  track(@Param('token') token: string) {
    return this.deliveries.trackByToken(token);
  }
}
