import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';
import { UserGuard } from 'src/guards/user.guard';
import { DeliveriesModule } from 'src/deliveries/deliveries.module';
import { DeliveriesService } from 'src/deliveries/deliveries.service';
import { LocationDto } from 'src/deliveries/dto/dto';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { CloudinaryController } from 'src/cloudinary/cloudinary.controller';
import { CUSTOMER_PHOTOS_MAX, SERVICE_JOB_MODELS, SERVICE_PHOTO_MAX_BYTES, ServiceReview, WORKER_PHOTOS_MAX } from './models';
import { JobsService, refreshStoreRating } from './jobs.service';
import { WorkerGuard } from './worker.guard';
import {
  GeoDto,
  HideReviewDto,
  JobAssignDto,
  JobBeginDto,
  JobCancelDto,
  JobCommentDto,
  JobCompleteDto,
  JobFailDto,
  JobPriceDto,
  JobRejectDto,
  JobScheduleDto,
  ReviewDto,
  UpdateJobDto,
  WarrantyClaimDto,
  WorkerMeDto,
} from './dto';

// ============================================================ hamkor (orqa ofis)
@ApiTags('Jobs')
@ApiBearerAuth()
@ApiSecurity('service-key')
@UseGuards(StoreAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @ApiOperation({ summary: 'Ishlar (?status=&store_id=&worker_id=&order_id=&date_from=&date_to=&page=&limit=)' })
  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.jobs.list(req.storeUser, q);
  }

  @ApiOperation({ summary: 'Bitta ish — tarix (events) va baho bilan' })
  @Get(':id')
  one(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.jobs.getOne(id, req.storeUser);
  }

  @ApiOperation({ summary: "Naqd summa (cod_amount) yoki yetkazishga bog'lash (delivery_id)" })
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateJobDto, @Req() req: any) {
    return this.jobs.update(id, dto, req.storeUser);
  }

  @ApiOperation({ summary: "Usta biriktirish — ko'nikma yo'q 409, begona usta 403" })
  @HttpCode(200)
  @Post(':id/assign')
  assign(@Param('id', ParseIntPipe) id: number, @Body() dto: JobAssignDto, @Req() req: any) {
    return this.jobs.assign(id, dto.worker_id, req.storeUser);
  }

  @ApiOperation({ summary: "Vaqt: mijoz taklifini tasdiqlash yoki boshqa vaqt (`agreed: true` — kelishilgan)" })
  @HttpCode(200)
  @Post(':id/schedule')
  schedule(@Param('id', ParseIntPipe) id: number, @Body() dto: JobScheduleDto, @Req() req: any) {
    return this.jobs.schedule(id, dto, req.storeUser);
  }

  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @Body() dto: JobCancelDto, @Req() req: any) {
    return this.jobs.cancel(id, dto.comment, req.storeUser);
  }

  @ApiOperation({ summary: 'Qayta tashrif (failed -> pending)' })
  @HttpCode(200)
  @Post(':id/retry')
  retry(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.jobs.retry(id, req.storeUser);
  }

  @ApiOperation({ summary: "Ilovasiz mijoz: telefonda kelishilgan narxni tasdiqlash (comment majburiy)" })
  @HttpCode(200)
  @Post(':id/price/accept')
  priceAccept(@Param('id', ParseIntPipe) id: number, @Body() dto: JobCommentDto, @Req() req: any) {
    return this.jobs.storePriceAnswer(id, true, dto.comment, req.storeUser);
  }

  @HttpCode(200)
  @Post(':id/price/reject')
  priceReject(@Param('id', ParseIntPipe) id: number, @Body() dto: JobCommentDto, @Req() req: any) {
    return this.jobs.storePriceAnswer(id, false, dto.comment, req.storeUser);
  }
}

// ============================================================ usta ilovasi
const photoFiles = (max: number) =>
  FileFieldsInterceptor(
    [
      { name: 'photos', maxCount: max },
      { name: 'photo', maxCount: 1 },
    ],
    { limits: { fileSize: SERVICE_PHOTO_MAX_BYTES, files: max } },
  );

/** Rasmlarni tekshirib (magic bytes) Cloudinary'ga yuklaydi; havolalarni qaytaradi. */
async function uploadPhotos(cloud: CloudinaryService, files: any, max: number, folder: string) {
  const list: Express.Multer.File[] = [...(files?.photos || []), ...(files?.photo || [])];
  if (!list.length) throw new BadRequestException('Rasm yuborilmadi (photos yoki photo)');
  if (list.length > max) throw new BadRequestException(`${max} tagacha rasm`);
  for (const f of list) {
    if (!f.buffer?.length || !CloudinaryController.IMAGE_TYPES.some((t) => t.test(f.buffer))) {
      throw new BadRequestException('Faqat rasm (JPG, PNG, WEBP, GIF, AVIF)');
    }
  }
  const urls: string[] = [];
  for (const f of list) urls.push((await cloud.uploadImage(f.buffer, folder)).url);
  return { urls };
}

@ApiTags('Worker app')
@ApiBearerAuth()
@UseGuards(WorkerGuard)
@Controller('worker')
export class WorkerController {
  constructor(
    private readonly jobs: JobsService,
    private readonly deliveries: DeliveriesService,
    private readonly cloud: CloudinaryService,
  ) {}

  @ApiOperation({ summary: 'Profil: ko\'nikmalar, is_online' })
  @Get('me')
  me(@Req() req: any) {
    const c = req.courier.get({ plain: true });
    return {
      id: c.id,
      full_name: c.full_name,
      phone: c.phone,
      store_id: c.store_id,
      skills: c.skills,
      vehicle_type: c.vehicle_type,
      is_online: c.is_online,
      documents_ok: !!c.documents_verified_at,
      role: req.storeUser?.role,
    };
  }

  @Patch('me')
  async updateMe(@Body() dto: WorkerMeDto, @Req() req: any) {
    await req.courier.update({ is_online: dto.is_online, last_seen_at: new Date() });
    return { is_online: req.courier.is_online };
  }

  @ApiOperation({ summary: "Yetkazishlar VA ishlar bitta ro'yxatda, vaqt bo'yicha: [{ type: 'delivery'|'job', … }]" })
  @Get('tasks')
  async tasks(@Req() req: any, @Query('scope') scope?: string) {
    const s = scope === 'history' ? 'history' : 'active';
    const [deliveries, jobs] = await Promise.all([
      this.deliveries.courierList(req.courier, s),
      this.jobs.workerList(req.courier, s),
    ]);
    const all = [
      ...deliveries.map((d: any) => ({ ...d, type: 'delivery', at: d.window_from ?? null })),
      ...jobs.map((j: any) => ({ ...j, type: 'job', at: j.scheduled_from ?? null })),
    ];
    const time = (x: any) => (x.at ? new Date(x.at).getTime() : Number.POSITIVE_INFINITY);
    const upd = (x: any) => new Date(x.updated_at || 0).getTime();
    all.sort((a, b) => (s === 'history' ? upd(b) - upd(a) : time(a) - time(b) || a.id - b.id));
    return all;
  }

  @Get('jobs/:id')
  job(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.jobs.workerOne(req.courier, id);
  }

  @HttpCode(200)
  @Post('jobs/:id/accept')
  accept(@Param('id', ParseIntPipe) id: number, @Body() dto: GeoDto, @Req() req: any) {
    return this.jobs.workerAccept(req.courier, id, dto);
  }

  @ApiOperation({ summary: 'Rad etish — sabab (comment) majburiy; ish hamkorga qaytadi' })
  @HttpCode(200)
  @Post('jobs/:id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: JobRejectDto, @Req() req: any) {
    return this.jobs.workerReject(req.courier, id, dto.comment, dto);
  }

  @ApiOperation({ summary: "Yo'lga chiqish — vaqt confirmed bo'lmasa 409; joylashuv yuborish boshlanadi" })
  @HttpCode(200)
  @Post('jobs/:id/start')
  start(@Param('id', ParseIntPipe) id: number, @Body() dto: GeoDto, @Req() req: any) {
    return this.jobs.workerStart(req.courier, id, dto);
  }

  @HttpCode(200)
  @Post('jobs/:id/arrive')
  arrive(@Param('id', ParseIntPipe) id: number, @Body() dto: GeoDto, @Req() req: any) {
    return this.jobs.workerArrive(req.courier, id, dto);
  }

  @ApiOperation({ summary: 'Ishni boshlash — kamida 1 ta "oldin" rasmi; tovar kelmagan bo\'lsa 409' })
  @HttpCode(200)
  @Post('jobs/:id/begin')
  begin(@Param('id', ParseIntPipe) id: number, @Body() dto: JobBeginDto, @Req() req: any) {
    return this.jobs.workerBegin(req.courier, id, dto);
  }

  @ApiOperation({ summary: "Yakuniy narx (faqat from narxli xizmat, arrived/in_progress) — mijoz tasdiqlaydi" })
  @HttpCode(200)
  @Post('jobs/:id/price')
  price(@Param('id', ParseIntPipe) id: number, @Body() dto: JobPriceDto, @Req() req: any) {
    return this.jobs.workerPrice(req.courier, id, dto);
  }

  @ApiOperation({ summary: 'Topshirish: kod YOKI "keyin" rasmi + izoh; narx tasdig\'i kutilsa 409' })
  @ApiResponse({ status: 429, description: 'Kod 5 marta xato — bloklangan' })
  @Throttle({ default: { limit: 20, ttl: 60 * 1000 } })
  @HttpCode(200)
  @Post('jobs/:id/complete')
  complete(@Param('id', ParseIntPipe) id: number, @Body() dto: JobCompleteDto, @Req() req: any) {
    return this.jobs.workerComplete(req.courier, id, dto);
  }

  @HttpCode(200)
  @Post('jobs/:id/fail')
  fail(@Param('id', ParseIntPipe) id: number, @Body() dto: JobFailDto, @Req() req: any) {
    return this.jobs.workerFail(req.courier, id, dto);
  }

  @ApiOperation({ summary: 'Joylashuv (`/api/courier/location` taxallusi) — ish on_the_way da ham yoziladi' })
  @Throttle({ default: { limit: 30, ttl: 60 * 1000 } })
  @HttpCode(200)
  @Post('location')
  location(@Body() dto: LocationDto, @Req() req: any) {
    return this.deliveries.location(req.courier, dto);
  }

  @ApiOperation({ summary: `Ish rasmlarini yuklash (photos[], ${WORKER_PHOTOS_MAX} tagacha, har biri ≤ 5 MB) — havolalar qaytadi` })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(photoFiles(WORKER_PHOTOS_MAX))
  @Post('photos')
  photos(@UploadedFiles() files: any) {
    return uploadPhotos(this.cloud, files, WORKER_PHOTOS_MAX, 'climavent/jobs');
  }
}

// ============================================================ mijoz
@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(UserGuard)
@Controller('orders')
export class CustomerJobsController {
  constructor(private readonly jobs: JobsService) {}

  @ApiOperation({ summary: 'Hamkor taklif qilgan yangi vaqtni tasdiqlash' })
  @HttpCode(200)
  @Post(':id/jobs/:jobId/schedule/accept')
  scheduleAccept(@Param('id', ParseIntPipe) id: number, @Param('jobId', ParseIntPipe) jobId: number, @Req() req: any) {
    return this.jobs.customerSchedule(id, jobId, true, req.user);
  }

  @HttpCode(200)
  @Post(':id/jobs/:jobId/schedule/reject')
  scheduleReject(@Param('id', ParseIntPipe) id: number, @Param('jobId', ParseIntPipe) jobId: number, @Req() req: any) {
    return this.jobs.customerSchedule(id, jobId, false, req.user);
  }

  @ApiOperation({ summary: 'Usta yuborgan yakuniy narxni tasdiqlash' })
  @HttpCode(200)
  @Post(':id/jobs/:jobId/price/accept')
  priceAccept(@Param('id', ParseIntPipe) id: number, @Param('jobId', ParseIntPipe) jobId: number, @Req() req: any) {
    return this.jobs.customerPrice(id, jobId, true, req.user);
  }

  @ApiOperation({ summary: 'Narxni rad etish — faqat chiqish haqi to\'lanadi' })
  @HttpCode(200)
  @Post(':id/jobs/:jobId/price/reject')
  priceReject(@Param('id', ParseIntPipe) id: number, @Param('jobId', ParseIntPipe) jobId: number, @Req() req: any) {
    return this.jobs.customerPrice(id, jobId, false, req.user);
  }

  @ApiOperation({ summary: "Ishni bekor qilish (usta yo'lga chiqquncha)" })
  @HttpCode(200)
  @Post(':id/jobs/:jobId/cancel')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Param('jobId', ParseIntPipe) jobId: number,
    @Body() dto: JobCancelDto,
    @Req() req: any,
  ) {
    return this.jobs.customerCancel(id, jobId, dto.comment, req.user);
  }

  @ApiOperation({ summary: 'Baho: 1–5 yulduz + izoh (faqat completed, bitta ishga bitta)' })
  @Post(':id/jobs/:jobId/review')
  review(
    @Param('id', ParseIntPipe) id: number,
    @Param('jobId', ParseIntPipe) jobId: number,
    @Body() dto: ReviewDto,
    @Req() req: any,
  ) {
    return this.jobs.review(id, jobId, dto, req.user);
  }

  @ApiOperation({ summary: "Kafolat bo'yicha murojaat — yangi ish, narxi 0" })
  @Post(':id/jobs/:jobId/warranty-claim')
  warranty(
    @Param('id', ParseIntPipe) id: number,
    @Param('jobId', ParseIntPipe) jobId: number,
    @Body() dto: WarrantyClaimDto,
    @Req() req: any,
  ) {
    return this.jobs.warrantyClaim(id, jobId, dto, req.user);
  }
}

/** Mijoz rasmlari (4-band) — xaridor tokeni bilan. */
@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(UserGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly cloud: CloudinaryService) {}

  @ApiOperation({ summary: `Xizmat uchun rasm (photos[], ${CUSTOMER_PHOTOS_MAX} tagacha, har biri ≤ 5 MB)` })
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { limit: 20, ttl: 60 * 1000 } })
  @UseInterceptors(photoFiles(CUSTOMER_PHOTOS_MAX))
  @Post('service-photo')
  upload(@UploadedFiles() files: any) {
    return uploadPhotos(this.cloud, files, CUSTOMER_PHOTOS_MAX, 'climavent/service-requests');
  }
}

// ============================================================ sharhlar (10-band)
@ApiTags('Services')
@Controller()
export class ServiceReviewsController {
  @ApiOperation({ summary: "Hamkorning xizmat sharhlari (tokensiz, yashirilganlarsiz)" })
  @Get('stores/:id/service-reviews')
  async publicList(@Param('id', ParseIntPipe) id: number, @Query('limit') limit?: string) {
    const rows = await ServiceReview.findAll({
      where: { store_id: id, is_hidden: false },
      attributes: ['id', 'rating', 'comment', 'created_at'],
      order: [['id', 'DESC']],
      limit: Math.min(Math.max(Number(limit) || 20, 1), 100),
    });
    return rows;
  }

  @ApiOperation({ summary: "Sharhlar (orqa ofis): o'z hamkori, yashirilganlari bilan" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard)
  @Get('service-reviews')
  async list(@Req() req: any, @Query('store_id') storeId?: string) {
    const r = req.storeUser;
    const where: any = {};
    if (r?.role !== 'superadmin') where.store_id = r.store_id;
    else if (storeId && /^\d+$/.test(storeId)) where.store_id = Number(storeId);
    return ServiceReview.findAll({ where, order: [['id', 'DESC']], limit: 200 });
  }

  @ApiOperation({ summary: 'Sharhni yashirish / qaytarish (`reviews.edit`) — reyting qayta hisoblanadi' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard)
  @Patch('service-reviews/:id')
  async hide(@Param('id', ParseIntPipe) id: number, @Body() dto: HideReviewDto, @Req() req: any) {
    const r = req.storeUser;
    const row = await ServiceReview.findByPk(id);
    if (!row || (r?.role !== 'superadmin' && Number(row.store_id) !== Number(r.store_id))) {
      throw new NotFoundException('Sharh topilmadi');
    }
    await row.update({ is_hidden: dto.is_hidden, hidden_by: dto.is_hidden ? r?.user_id ?? null : null } as any);
    await refreshStoreRating(row.store_id);
    return row;
  }
}

@Module({
  imports: [SequelizeModule.forFeature(SERVICE_JOB_MODELS), JwtModule.register({}), DeliveriesModule, CloudinaryModule],
  controllers: [JobsController, WorkerController, CustomerJobsController, UploadsController, ServiceReviewsController],
  providers: [JobsService, WorkerGuard],
  exports: [JobsService],
})
export class ServiceJobsModule {}

