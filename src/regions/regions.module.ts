import { Controller, Get, Header, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { REGIONS } from './regions.data';

/** Viloyat va tumanlar ro'yxati — tokensiz (topshiriq №39, 1-band). */
@ApiTags('Regions')
@Controller('regions')
export class RegionsController {
  @ApiOperation({ summary: "Viloyatlar (14) va ularning tumanlari, uch tilda" })
  @Header('Cache-Control', 'public, max-age=3600')
  @Get()
  list() {
    return REGIONS;
  }
}

@Module({ controllers: [RegionsController] })
export class RegionsModule {}
