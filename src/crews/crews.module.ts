import {
  Body,
  Controller,
  Delete,
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
  UseGuards,
} from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';
import { SuperadminGuard } from 'src/store_auth/superadmin.guard';
import { WorkerGuard } from 'src/service_jobs/worker.guard';
import { CREW_MODELS } from './models';
import { CrewsService } from './crews.service';
import { refreshAllTrust } from './trust';

// DIQQAT (`whitelist: true`): har maydonda validator bo'lishi SHART.
export class CrewInviteDto {
  @ApiProperty({ example: 'Bobur Aliyev' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  full_name: string;

  @ApiProperty({ example: '+998901234568' })
  @Matches(/^\+998\d{9}$/, { message: "phone +998XXXXXXXXX ko'rinishida bo'lsin" })
  phone: string;
}

export class VerifySkillsDto {
  @ApiProperty({ example: ['installation'], type: [String], description: '`service_categories.key`' })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  categories: string[];

  @ApiProperty({ required: false, example: 'Sertifikat #123 tekshirildi' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiProperty({ required: false, example: false, description: "true — ro'yxat almashtiriladi (olib tashlash uchun)" })
  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}

export class TopDto {
  @ApiProperty({ example: false, description: "false — `top` olib qo'yiladi; true — qaytariladi (shartlar baribir tekshiriladi)" })
  @IsBoolean()
  allowed: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class UpdateCrewDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  skills?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  members_count?: number;

  @ApiProperty({ required: false, example: [{ region_code: 'tashkent_city' }] })
  @IsOptional()
  @IsArray()
  service_areas?: any[];
}

// ============================================================ usta ilovasi (1.3)
@ApiTags('Worker app')
@ApiBearerAuth()
@UseGuards(WorkerGuard)
@Controller('worker/crew')
export class WorkerCrewController {
  constructor(private readonly crews: CrewsService) {}

  @ApiOperation({ summary: "Brigadam: a'zolar (boshliqqa — telefonlar va faol takliflar)" })
  @Get()
  get(@Req() req: any) {
    return this.crews.workerCrew(req.courier);
  }

  @ApiOperation({ summary: 'Taklif havolasi (faqat boshliq). SMS yo\'q — havolani Telegram orqali yuboring' })
  @ApiResponse({ status: 201, schema: { example: { id: 3, invite_token: '48 hex', url: 'https://climavent.uz/brigada/…', expires_at: '2026-10-05T10:00:00Z' } } })
  @Post('invites')
  invite(@Body() dto: CrewInviteDto, @Req() req: any) {
    return this.crews.createInvite(req.courier, dto);
  }

  @Delete('invites/:id')
  revoke(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.crews.revokeInvite(req.courier, id);
  }

  @ApiOperation({ summary: "A'zoni chiqarish (faqat boshliq); faol ishlardagi ijrochiligi ham olinadi" })
  @Delete('members/:courierId')
  remove(@Param('courierId', ParseIntPipe) courierId: number, @Req() req: any) {
    return this.crews.removeMember(req.courier, courierId);
  }
}

// ============================================================ orqa ofis
@ApiTags('Crews')
@ApiBearerAuth()
@ApiSecurity('service-key')
@UseGuards(StoreAuthGuard)
@Controller('crews')
export class CrewsController {
  constructor(private readonly crews: CrewsService) {}

  @ApiOperation({ summary: "Brigadalar (?store_id=|null&skill=&is_active=) — `top` ro'yxat boshida" })
  @Get()
  list(@Req() req: any, @Query('store_id') store_id?: string, @Query('skill') skill?: string, @Query('is_active') is_active?: string) {
    return this.crews.list(req.storeUser, { store_id, skill, is_active });
  }

  @Get(':id')
  one(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.crews.getOne(id, req.storeUser);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCrewDto, @Req() req: any) {
    return this.crews.update(id, dto, req.storeUser);
  }

  @ApiOperation({ summary: 'Brigada malakasini tasdiqlash (superadmin)' })
  @UseGuards(SuperadminGuard)
  @HttpCode(200)
  @Post(':id/verify-skills')
  verify(@Param('id', ParseIntPipe) id: number, @Body() dto: VerifySkillsDto, @Req() req: any) {
    return this.crews.verifyCrewSkills(id, dto, req.storeUser);
  }

  @ApiOperation({ summary: "`top` ni olib qo'yish / qaytarish (superadmin)" })
  @UseGuards(SuperadminGuard)
  @HttpCode(200)
  @Post(':id/top')
  top(@Param('id', ParseIntPipe) id: number, @Body() dto: TopDto, @Req() req: any) {
    return this.crews.setCrewTop(id, dto.allowed, dto.reason, req.storeUser);
  }
}

/** Ustaning ishonch darajasi (2-band) — superadmin. */
@ApiTags('Couriers')
@ApiBearerAuth()
@ApiSecurity('service-key')
@UseGuards(StoreAuthGuard, SuperadminGuard)
@Controller('couriers')
export class CourierTrustController {
  constructor(private readonly crews: CrewsService) {}

  @ApiOperation({ summary: 'Malakani tasdiqlash: sertifikat yoki Climavent sinov ishi (`trust_level` -> skills)' })
  @HttpCode(200)
  @Post(':id/verify-skills')
  verify(@Param('id', ParseIntPipe) id: number, @Body() dto: VerifySkillsDto, @Req() req: any) {
    return this.crews.verifyCourierSkills(id, dto, req.storeUser);
  }

  @ApiOperation({ summary: "`top` ni olib qo'yish / qaytarish" })
  @HttpCode(200)
  @Post(':id/top')
  top(@Param('id', ParseIntPipe) id: number, @Body() dto: TopDto, @Req() req: any) {
    return this.crews.setCourierTop(id, dto.allowed, dto.reason, req.storeUser);
  }
}

/** Kunlik fon ishi (2-band): `top` darajasini qo'yadi/oladi, statistikani yangilaydi. */
@Injectable()
export class TrustJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('TrustJobs');
  private timer: NodeJS.Timeout | null = null;

  onApplicationBootstrap() {
    if (process.env.TRUST_JOBS_DISABLED === 'true' || process.env.SELLER_JOBS_DISABLED === 'true') return;
    setTimeout(() => void this.tick(), 5 * 60 * 1000).unref();
    this.timer = setInterval(() => void this.tick(), 24 * 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    try {
      const r = await refreshAllTrust();
      if (r.couriers.length || r.crews.length) {
        this.logger.log(`Ishonch darajasi o'zgardi: ${r.couriers.length} ta usta, ${r.crews.length} ta brigada`);
      }
    } catch (e) {
      this.logger.error(`Ishonch darajasi hisoblanmadi: ${(e as Error).message}`);
    }
  }
}

@Module({
  imports: [SequelizeModule.forFeature(CREW_MODELS), JwtModule.register({})],
  controllers: [WorkerCrewController, CrewsController, CourierTrustController],
  providers: [CrewsService, WorkerGuard, TrustJobs],
  exports: [CrewsService],
})
export class CrewsModule {}
