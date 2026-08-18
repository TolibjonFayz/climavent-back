import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateUsdRateDto } from './dto/update-usd-rate.dto';
import { JwtOrServiceKeyGuard } from 'src/guards/jwt_or_service_key.guard';

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

  // Faqat admin (yoki xizmat kaliti bilan bot — masalan kursni
  // avtomatik yangilash uchun)
  @ApiOperation({ summary: 'Update USD rate (admin/bot)' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Patch('usd-rate')
  async updateUsdRate(@Body() dto: UpdateUsdRateDto) {
    return this.settingsService.updateUsdRate(dto.rate);
  }
}
