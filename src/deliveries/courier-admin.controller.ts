import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';
import { COURIER_DOC_MAX_BYTES } from './constants';
import { CouriersService } from './couriers.service';
import { CourierDocumentsService } from './courier-documents.service';
import { CourierVehiclesService } from './courier-vehicles.service';
import { CourierWorkService } from './courier-work.service';
import {
  CourierDocumentDto,
  CourierPayoutDto,
  CourierRateDto,
  CourierVehicleDto,
  RejectVehicleDto,
} from './dto/dto';

const docFile = () => FileInterceptor('file', { limits: { fileSize: COURIER_DOC_MAX_BYTES, files: 1 } });

/**
 * Kuryer hujjatlari, transporti va hisob-kitobi — ADMINKA (topshiriq №26).
 *
 * Do'kon admini — faqat O'Z kuryerlari; superadmin (servis kaliti ham) —
 * hammasi. Tekshiruv `CouriersService.getOwned` da.
 */
@ApiTags('Couriers')
@ApiBearerAuth()
@ApiSecurity('service-key')
@UseGuards(StoreAuthGuard)
@Controller('couriers')
export class CourierAdminController {
  constructor(
    private readonly couriers: CouriersService,
    private readonly documents: CourierDocumentsService,
    private readonly vehicles: CourierVehiclesService,
    private readonly work: CourierWorkService,
  ) {}

  // ============================================================ hujjatlar (1-band)
  @ApiOperation({ summary: "Kuryer hujjatlari + qaysilari majburiy va yetishmayotgani" })
  @Get(':id/documents')
  async listDocuments(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.documents.list(await this.couriers.getOwned(id, req.storeUser));
  }

  @ApiOperation({ summary: 'Hujjat yuklash (PDF/JPG/PNG, 10 MB gacha)' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, schema: { example: { id: 7, type: 'passport', original_name: 'pasport.pdf', size: 348211 } } })
  @UseInterceptors(docFile())
  @Post(':id/documents')
  async addDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CourierDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    const courier = await this.couriers.getOwned(id, req.storeUser);
    return this.documents.store(courier, dto.type, file, req.storeUser, dto.vehicle_id ?? null);
  }

  @ApiOperation({ summary: '5 daqiqalik imzolangan havola (fayl ochiq URL da turmaydi)' })
  @ApiResponse({ status: 200, schema: { example: { url: '/api/courier-documents/file/…', expires_at: '2026-09-21T10:05:00Z' } } })
  @Get(':id/documents/:docId/url')
  async documentUrl(
    @Param('id', ParseIntPipe) id: number,
    @Param('docId', ParseIntPipe) docId: number,
    @Req() req: any,
  ) {
    const courier = await this.couriers.getOwned(id, req.storeUser);
    return this.documents.signUrl(courier, docId);
  }

  @ApiOperation({ summary: "Hujjatlarni tasdiqlash — shundan keyin biriktirish mumkin" })
  @ApiResponse({ status: 409, description: 'Majburiy hujjatlar yuklanmagan' })
  @HttpCode(200)
  @Post(':id/documents/verify')
  async verify(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const courier = await this.couriers.getOwned(id, req.storeUser);
    return this.documents.verify(courier, req.storeUser);
  }

  @ApiOperation({ summary: "Tasdiqni olib tashlash (hujjat eskirgan yoki soxta)" })
  @Delete(':id/documents/verify')
  async unverify(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const courier = await this.couriers.getOwned(id, req.storeUser);
    return this.documents.unverify(courier);
  }

  // ============================================================ transport (1a-band)
  @ApiOperation({ summary: 'Kuryerning transportlari' })
  @Get(':id/vehicles')
  async listVehicles(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.vehicles.listFor(await this.couriers.getOwned(id, req.storeUser));
  }

  @ApiOperation({ summary: "Admin transport qo'shadi — darhol `approved`" })
  @Post(':id/vehicles')
  async addVehicle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CourierVehicleDto,
    @Req() req: any,
  ) {
    const courier = await this.couriers.getOwned(id, req.storeUser);
    return this.vehicles.add(courier, dto, {
      approved: true,
      actor: {
        type: req.storeUser?.role === 'superadmin' ? 'superadmin' : 'store',
        id: req.storeUser?.user_id ?? null,
      },
    });
  }

  @HttpCode(200)
  @Post(':id/vehicles/:vid/approve')
  async approveVehicle(
    @Param('id', ParseIntPipe) id: number,
    @Param('vid', ParseIntPipe) vid: number,
    @Req() req: any,
  ) {
    const courier = await this.couriers.getOwned(id, req.storeUser);
    return this.vehicles.approve(courier, vid, req.storeUser);
  }

  @HttpCode(200)
  @Post(':id/vehicles/:vid/reject')
  async rejectVehicle(
    @Param('id', ParseIntPipe) id: number,
    @Param('vid', ParseIntPipe) vid: number,
    @Body() dto: RejectVehicleDto,
    @Req() req: any,
  ) {
    const courier = await this.couriers.getOwned(id, req.storeUser);
    return this.vehicles.reject(courier, vid, dto.reason, req.storeUser);
  }

  @ApiOperation({ summary: "Transport holati tarixi: kim, qachon, qaysi holatdan qaysisiga" })
  @Get(':id/vehicles/:vid/events')
  async vehicleEvents(
    @Param('id', ParseIntPipe) id: number,
    @Param('vid', ParseIntPipe) vid: number,
    @Req() req: any,
  ) {
    const courier = await this.couriers.getOwned(id, req.storeUser);
    return this.vehicles.events(courier, vid);
  }

  // ============================================================ smena va hisob-kitob (6-, 8-band)
  @ApiOperation({ summary: 'Kuryer qachon ishga chiqib qachon ketgan' })
  @Get(':id/shifts')
  async shifts(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.couriers.getOwned(id, req.storeUser);
    return this.work.shiftsOf(id, { from, to });
  }

  @Get(':id/payouts')
  payouts(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.work.payouts(id, req.storeUser);
  }

  @ApiOperation({ summary: 'Kuryerga to\'lov (hisob-kitob)' })
  @Post(':id/payouts')
  addPayout(@Param('id', ParseIntPipe) id: number, @Body() dto: CourierPayoutDto, @Req() req: any) {
    return this.work.addPayout(id, dto, req.storeUser);
  }
}

/**
 * Yetkazish tariflari (topshiriq №26, 6-band).
 * `store_id: null` — platforma tarifi, faqat superadmin qo'yadi.
 */
@ApiTags('Couriers')
@ApiBearerAuth()
@ApiSecurity('service-key')
@UseGuards(StoreAuthGuard)
@Controller('courier-rates')
export class CourierRatesController {
  constructor(private readonly work: CourierWorkService) {}

  @ApiOperation({ summary: "Tariflar (do'kon admini — o'ziniki va platformaniki)" })
  @Get()
  list(@Req() req: any) {
    return this.work.listRates(req.storeUser);
  }

  @ApiOperation({ summary: "Tarifni qo'yish yoki yangilash" })
  @Put()
  upsert(@Body() dto: CourierRateDto, @Req() req: any) {
    return this.work.upsertRate(dto, req.storeUser);
  }
}

/**
 * Hujjat faylining o'zi — imzolangan havola bilan, GUVOHNOMASIZ.
 *
 * Brauzer yangi oynada `Authorization` sarlavhasini yubora olmaydi,
 * shuning uchun havolaning o'zi imzolangan va 5 daqiqa yashaydi
 * (sotuvchi hujjatlari bilan bir xil yechim, №16).
 */
@ApiTags('Couriers')
@Controller('courier-documents')
export class CourierDocumentFileController {
  constructor(private readonly documents: CourierDocumentsService) {}

  @ApiOperation({ summary: 'Imzolangan havola bo\'yicha fayl (5 daqiqa)' })
  @ApiResponse({ status: 410, description: "Havola muddati o'tgan yoki fayl o'chirilgan" })
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Get('file/:token')
  async file(@Param('token') token: string, @Res() res: Response) {
    const { doc, data } = await this.documents.openSigned(token);
    res.setHeader('Content-Type', doc.mime);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`,
    );
    res.send(data);
  }
}
