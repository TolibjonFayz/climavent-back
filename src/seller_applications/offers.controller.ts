import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OFFER_KINDS } from 'src/offers/model/offer-version.model';
import { SellerApplicationsService } from './seller-applications.service';

@ApiTags('Offers')
@Controller('offers')
export class OffersController {
  constructor(private readonly service: SellerApplicationsService) {}

  @ApiOperation({ summary: 'Joriy oferta versiyasi (guvohnomasiz)' })
  @ApiQuery({ name: 'kind', enum: OFFER_KINDS, example: 'seller' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        version: '1.0',
        url: 'https://climavent.uz/oferta/sotuvchi',
        effective_at: '2026-10-01T00:00:00Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: "Bu tur uchun joriy oferta e'lon qilinmagan" })
  @Get('current')
  async current(@Query('kind') kind: string) {
    if (!(OFFER_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException(`kind: ${OFFER_KINDS.join(', ')}`);
    }
    return this.service.currentOffer(kind);
  }
}
