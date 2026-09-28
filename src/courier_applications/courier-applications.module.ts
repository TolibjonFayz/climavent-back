import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';
import { SuperadminGuard } from 'src/store_auth/superadmin.guard';
import { parsePositiveIntParam } from 'src/common/helpers/pagination';
import { APP_DOC_MAX_BYTES, APPLICATION_STATUSES, COURIER_APPLICATION_MODELS } from './models';
import { Actor, CourierApplicationsService } from './courier-applications.service';
import {
  ApproveCourierApplicationDto,
  CourierAppNoteDto,
  CreateCourierApplicationDto,
  RejectCourierApplicationDto,
  RequestInfoCourierDto,
  ResubmitCourierApplicationDto,
  UploadAppDocumentDto,
} from './dto';

const HOUR = 60 * 60 * 1000;
// IP boshiga soatiga 5 ta ariza (4-band). Muhit o'zgaruvchisi faqat sinov serverida.
const APPLY_LIMIT = Number(process.env.COURIER_APPLY_RATE_LIMIT) || 5;

const ctxOf = (req: Request) => ({ ip: req.ip, userAgent: String(req.headers['user-agent'] || '') });
const actorOf = (req: any): Actor => ({
  id: req.storeUser?.user_id ?? null,
  login: req.storeUser?.user_id ? req.storeUser?.login ?? null : null,
});
const noStore = (res: Response) => {
  // Manzilda token bor — keshlanmasin va boshqa saytga sizmasin
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
};

/**
 * Kuryer / usta bo'lish arizasi — topshiriq №41 (Climavent Pro ilovasidan).
 *
 * Ommaviy yo'llar guvohnomasiz (ilova), superadmin yo'llari — superadmin tokeni
 * yoki servis kaliti; do'kon admini 403 (nomzodlarning pasporti).
 * Joriy oferta: `GET /api/offers/current?kind=courier` (umumiy endpoint).
 */
@ApiTags('Courier applications')
@Controller('courier-applications')
export class CourierApplicationsController {
  constructor(private readonly service: CourierApplicationsService) {}

  // ================================================== OMMAVIY
  @ApiOperation({ summary: 'Hujjat yuklash (guvohnomasiz): file + type — rasm yoki PDF, ≤ 10 MB' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, type: { type: 'string', example: 'passport' } } } })
  @ApiResponse({ status: 201, schema: { example: { id: 81, type: 'passport', original_name: 'pasport.jpg', size: 348211 } } })
  @Throttle({ default: { limit: 30, ttl: HOUR } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: APP_DOC_MAX_BYTES, files: 1 } }))
  @Post('documents')
  upload(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadAppDocumentDto) {
    return this.service.uploadDocument(file, dto.type);
  }

  @ApiOperation({ summary: 'Ariza topshirish (guvohnomasiz)' })
  @ApiResponse({ status: 201, schema: { example: { id: 12, status: 'pending', public_token: '64 hex' } } })
  @ApiResponse({ status: 400, description: "Format, 18 yosh, parol, oferta, hujjat ({ missing }), transport/guvohnoma" })
  @ApiResponse({ status: 409, description: 'Oferta eskirgan yoki shu raqam bilan ariza/hisob bor' })
  @Throttle({ default: { limit: APPLY_LIMIT, ttl: HOUR } })
  @Post()
  create(@Body() dto: CreateCourierApplicationDto, @Req() req: Request) {
    return this.service.create(dto, ctxOf(req));
  }

  @ApiOperation({ summary: 'Ariza holati (pasport, TIN, parol qaytmaydi)' })
  @Throttle({ default: { limit: 30, ttl: 60 * 1000 } })
  @Get('status/:token')
  status(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    noStore(res);
    return this.service.status(token);
  }

  @ApiOperation({ summary: "Ma'lumot so'ralganda to'ldirish (faqat needs_info) -> pending" })
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  @Patch('status/:token')
  resubmit(@Param('token') token: string, @Body() dto: ResubmitCourierApplicationDto, @Res({ passthrough: true }) res: Response) {
    noStore(res);
    return this.service.resubmit(token, dto);
  }

  @ApiOperation({ summary: 'Arizani qaytarib olish (pending/needs_info)' })
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  @HttpCode(200)
  @Post('status/:token/withdraw')
  withdraw(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    noStore(res);
    return this.service.withdraw(token);
  }

  @ApiOperation({ summary: 'Hujjatni ochish (5 daqiqalik imzolangan havola)' })
  @Get('documents/file')
  async file(@Query('token') token: string, @Res() res: Response) {
    const { doc, data } = await this.service.openSigned(token);
    res.setHeader('Content-Type', doc.mime);
    res.setHeader('Content-Length', String(data.length));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`);
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    // Adminka boshqa domenda oldindan ko'rsata olsin (№16 dagi sabab bilan)
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.removeHeader('X-Frame-Options');
    res.end(data);
  }

  // ================================================== SUPERADMIN
  @ApiOperation({ summary: "Arizalar (?status=&skill=&region=&search=&page=&limit=) — jami X-Total-Count" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @Get('all')
  async all(
    @Res({ passthrough: true }) res: Response,
    @Query('status') status?: string,
    @Query('skill') skill?: string,
    @Query('region') region?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (status && !(APPLICATION_STATUSES as readonly string[]).includes(status)) status = '__none__';
    const { rows, total } = await this.service.list({
      status,
      skill,
      region,
      search,
      page: parsePositiveIntParam(page, 'page'),
      limit: parsePositiveIntParam(limit, 'limit'),
    });
    res.setHeader('X-Total-Count', String(total));
    return rows;
  }

  @ApiOperation({ summary: 'Bitta ariza: hujjatlar va tarix bilan' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @Get('one/:id')
  one(@Param('id', ParseIntPipe) id: number) {
    return this.service.getOne(id);
  }

  @ApiOperation({ summary: '5 daqiqalik hujjat havolasi' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @Get(':id/documents/:docId/url')
  url(
    @Param('id', ParseIntPipe) id: number,
    @Param('docId', ParseIntPipe) docId: number,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.documentUrl(id, docId, `${req.protocol}://${req.get('host')}`);
  }

  @ApiOperation({ summary: 'Tasdiqlash — hisob, kuryer, transport, hujjatlar, oferta dalili (bitta tranzaksiya)' })
  @ApiResponse({ status: 201, schema: { example: { courier: { id: 12 }, store_user: { id: 301, login: '998901234567' } } } })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @Post(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number, @Body() dto: ApproveCourierApplicationDto, @Req() req: any) {
    return this.service.approve(id, dto, actorOf(req));
  }

  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @HttpCode(200)
  @Post(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectCourierApplicationDto, @Req() req: any) {
    return this.service.reject(id, dto.reason, actorOf(req));
  }

  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @HttpCode(200)
  @Post(':id/request-info')
  requestInfo(@Param('id', ParseIntPipe) id: number, @Body() dto: RequestInfoCourierDto, @Req() req: any) {
    return this.service.requestInfo(id, dto.message, dto.missing_documents, actorOf(req));
  }

  @ApiOperation({ summary: "Ichki izoh (masalan, \"Qo'ng'iroq qilindi\")" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @Patch('update/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: CourierAppNoteDto, @Req() req: any) {
    return this.service.updateNote(id, dto.admin_note, actorOf(req));
  }
}

/**
 * Fon tozalash (6-band), soatiga: 24 soatda bog'lanmagan yuklamalar va
 * rad etilgan/qaytarib olingan arizalarning 30 kundan eski hujjatlari.
 */
@Injectable()
export class CourierApplicationsJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CourierApplicationsJobs.name);
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly service: CourierApplicationsService) {}

  onApplicationBootstrap() {
    if (process.env.SELLER_JOBS_DISABLED === 'true') return;
    setTimeout(() => this.tick(), 90 * 1000).unref();
    this.timer = setInterval(() => this.tick(), HOUR);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    try {
      await this.service.runMaintenance();
    } catch (e) {
      this.logger.error(`Kuryer arizalari tozalash yiqildi: ${(e as Error).message}`);
    }
  }
}

@Module({
  imports: [SequelizeModule.forFeature(COURIER_APPLICATION_MODELS), JwtModule.register({})],
  controllers: [CourierApplicationsController],
  providers: [CourierApplicationsService, CourierApplicationsJobs],
})
export class CourierApplicationsModule {}
