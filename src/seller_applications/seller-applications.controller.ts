import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';
import { SuperadminGuard } from 'src/store_auth/superadmin.guard';
import { parsePositiveIntParam } from 'src/common/helpers/pagination';
import { Actor, SellerApplicationsService } from './seller-applications.service';
import {
  ApproveApplicationDto,
  CreateSellerApplicationDto,
  RejectApplicationDto,
  RequestInfoDto,
  ResubmitSellerApplicationDto,
  UpdateApplicationNoteDto,
  UploadDocumentDto,
} from './dto/seller-application.dto';
import { APPLICATION_STATUSES, DOC_MAX_BYTES } from './constants';

const HOUR = 60 * 60 * 1000;

// IP boshiga soatiga arizalar (4-savol). Standart 5; muhit o'zgaruvchisi faqat
// sinov serverida oshiriladi — prod'da berilmaydi.
const APPLY_LIMIT = Number(process.env.SELLER_APPLY_RATE_LIMIT) || 5;

const ctxOf = (req: Request) => ({
  // `trust proxy` yoqilgan (main.ts) — `req.ip` Railway proksisiniki emas,
  // mijozniki. Oferta dalilida aynan shu yoziladi.
  ip: req.ip,
  userAgent: String(req.headers['user-agent'] || ''),
});

// Servis kaliti bilan kelinsa hisob yozuvi yo'q — aktor NULL.
const actorOf = (req: any): Actor => ({
  id: req.storeUser?.user_id ?? null,
  login: req.storeUser?.user_id ? req.storeUser?.login ?? null : null,
});

@ApiTags('Seller applications')
@Controller('seller-applications')
export class SellerApplicationsController {
  constructor(private readonly service: SellerApplicationsService) {}

  // ================================================== OMMAVIY (sayt uchun)

  @ApiOperation({ summary: 'Hujjat yuklash (guvohnomasiz)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        type: { type: 'string', example: 'passport' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    schema: { example: { id: 41, type: 'passport', original_name: 'pasport.pdf', size: 348211 } },
  })
  @ApiResponse({ status: 400, description: 'PDF/JPG/PNG emas yoki 10 MB dan katta' })
  @Throttle({ default: { limit: 30, ttl: HOUR } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: DOC_MAX_BYTES, files: 1 } }))
  @Post('documents')
  async upload(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadDocumentDto) {
    return this.service.uploadDocument(file, dto.type);
  }

  @ApiOperation({ summary: 'Ariza topshirish (guvohnomasiz)' })
  @ApiResponse({ status: 201, schema: { example: { id: 17, status: 'pending', public_token: 'b3f1…' } } })
  @ApiResponse({ status: 400, description: "Maydon noto'g'ri, oferta qabul qilinmagan yoki hujjat yetishmaydi" })
  @ApiResponse({ status: 409, description: "Oferta eskirgan yoki shu STIR bilan ariza/do'kon bor" })
  @Throttle({ default: { limit: APPLY_LIMIT, ttl: HOUR } })
  @Post()
  async create(@Body() dto: CreateSellerApplicationDto, @Req() req: Request) {
    return this.service.create(dto, ctxOf(req));
  }

  @ApiOperation({ summary: 'Ariza holati (sotuvchi sahifasi uchun)' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: 'needs_info',
        store_name: 'Aircool',
        created_at: '2026-09-14T09:12:00Z',
        info_request: 'Direktorni tayinlash qarori yuklanmagan',
        reject_reason: null,
        missing_documents: ['director_appointment'],
      },
    },
  })
  @Get('status/:token')
  async status(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    // Manzilda token bor — hech qayerga yo'naltirilmasin va keshlanmasin
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    return this.service.getStatus(token);
  }

  @ApiOperation({ summary: "Ma'lumot so'ralganda to'ldirish (faqat needs_info)" })
  @ApiResponse({ status: 409, description: "Holat needs_info emas" })
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  @Patch('status/:token')
  async resubmit(
    @Param('token') token: string,
    @Body() dto: ResubmitSellerApplicationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    return this.service.resubmit(token, dto, ctxOf(req));
  }

  // Imzolangan havola (superadmin oldi, brauzer yangi oynada ochadi).
  @ApiOperation({ summary: 'Hujjatni ochish (5 daqiqalik imzolangan havola)' })
  @ApiResponse({ status: 410, description: "Havola muddati o'tgan yoki fayl o'chirilgan" })
  @Get('documents/file')
  async file(@Query('token') token: string, @Res() res: Response) {
    const { doc, data } = await this.service.openDocument(token);
    res.setHeader('Content-Type', doc.mime);
    res.setHeader('Content-Length', String(data.length));
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`,
    );
    // Pasport keshlarda qolmasin, boshqa saytga manzil sizmasin.
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    // Adminka boshqa domenda: rasm/PDF ni o'z sahifasida oldindan ko'rsata
    // olsin. Helmet'ning standart `same-origin` / `SAMEORIGIN` i buni
    // to'sardi. Xavfsizlik havolaning o'zida: 5 daqiqa, imzolangan.
    // `CSP: sandbox` ATAYLAB qo'yilmagan — Chrome sandbox ichida PDF
    // ko'ruvchisini bloklaydi. Fayl ichidan skript bajarilishini esa
    // magic-bytes tekshiruvi + aniq Content-Type + `nosniff` to'sadi.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.removeHeader('X-Frame-Options');
    res.end(data);
  }

  // =============================================================== SUPERADMIN
  // Servis kaliti yoki superadmin tokeni. `store_admin` -> 403: arizalarda
  // raqobatchining rekvizitlari va pasport ma'lumotlari bor.

  @ApiOperation({ summary: "Arizalar ro'yxati (superadmin)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiQuery({ name: 'status', required: false, enum: APPLICATION_STATUSES })
  @ApiQuery({ name: 'page', required: false, example: '1' })
  @ApiQuery({ name: 'limit', required: false, example: '50', description: "Standart 50, eng ko'pi 200" })
  @ApiQuery({ name: 'search', required: false, description: "Yuridik nom, do'kon nomi, STIR yoki telefon" })
  @ApiResponse({ status: 200, description: 'Massiv. Jami son — X-Total-Count sarlavhasida' })
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @Get('all')
  async all(
    @Res({ passthrough: true }) res: Response,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    if (status && !(APPLICATION_STATUSES as readonly string[]).includes(status)) {
      status = '__none__';
    }
    const { rows, total } = await this.service.list({
      status,
      page: parsePositiveIntParam(page, 'page'),
      limit: parsePositiveIntParam(limit, 'limit'),
      search,
    });
    res.setHeader('X-Total-Count', String(total));
    return rows;
  }

  @ApiOperation({ summary: 'Bitta ariza: hujjatlar va tarix bilan (superadmin)' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @Get('one/:id')
  async one(@Param('id', ParseIntPipe) id: number) {
    return this.service.getOne(id);
  }

  @ApiOperation({ summary: '5 daqiqalik hujjat havolasi (superadmin)' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiResponse({ status: 200, schema: { example: { url: 'https://…/api/seller-applications/documents/file?token=…', expires_at: '2026-09-14T09:17:00Z' } } })
  @ApiResponse({ status: 410, description: "Fayl saqlash muddati tugab o'chirilgan" })
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @Get(':id/documents/:docId/url')
  async documentUrl(
    @Param('id', ParseIntPipe) id: number,
    @Param('docId', ParseIntPipe) docId: number,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.documentUrl(id, docId, `${req.protocol}://${req.get('host')}`);
  }

  @ApiOperation({ summary: "Tasdiqlash: do'kon + hisob + parol havolasi (superadmin)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        store: { id: 12, name: 'Aircool', slug: 'aircool', is_active: false },
        store_user: { id: 31, login: 'aircool' },
        password_setup_token: '9c1e…',
        password_setup_expires_at: '2026-09-17T09:30:00Z',
      },
    },
  })
  @ApiResponse({ status: 409, description: "Yakuniy holat, login/slug band yoki STIR bilan do'kon bor" })
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @Post(':id/approve')
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveApplicationDto,
    @Req() req: any,
  ) {
    return this.service.approve(id, dto, actorOf(req));
  }

  @ApiOperation({ summary: 'Rad etish (superadmin)' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  // Hech narsa yaratilmaydi — yangilangan ariza qaytadi
  @HttpCode(200)
  @Post(':id/reject')
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectApplicationDto,
    @Req() req: any,
  ) {
    return this.service.reject(id, dto.reason, actorOf(req));
  }

  @ApiOperation({ summary: "Ma'lumot so'rash (superadmin)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  // Hech narsa yaratilmaydi — yangilangan ariza qaytadi
  @HttpCode(200)
  @Post(':id/request-info')
  async requestInfo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestInfoDto,
    @Req() req: any,
  ) {
    return this.service.requestInfo(id, dto.message, actorOf(req));
  }

  @ApiOperation({ summary: 'Ichki izoh (superadmin)' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @Patch('update/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateApplicationNoteDto,
    @Req() req: any,
  ) {
    return this.service.updateNote(id, dto.admin_note ?? null, actorOf(req));
  }
}
