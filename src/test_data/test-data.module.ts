import { Body, Controller, Get, HttpCode, Module, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtModule } from '@nestjs/jwt';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';
import { SuperadminGuard } from 'src/store_auth/superadmin.guard';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { R2DocumentsStore } from 'src/seller_applications/r2-documents.store';
import { AuditActor, PURGE_ROOTS, TEST_ENTITIES, TestDataService, TestEntity } from './test-data.service';

export class TestFlagDto {
  @ApiProperty({ enum: TEST_ENTITIES, example: 'order' })
  @IsIn(TEST_ENTITIES as unknown as string[])
  entity: TestEntity;

  @ApiProperty({ example: 120 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  is_test: boolean;
}

export class PurgeDto {
  @ApiProperty({ example: 'TOZALASH' })
  @IsString()
  confirm: string;

  @ApiProperty({ required: false, enum: PURGE_ROOTS, isArray: true, example: ['orders'] })
  @IsOptional()
  @IsArray()
  @IsIn(PURGE_ROOTS as unknown as string[], { each: true })
  entities?: string[];

  @ApiProperty({ required: false, example: '2026-09-28', description: 'Faqat shu sanadan OLDIN yaratilganlar' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}/)
  before?: string;
}

function actorOf(req: any): AuditActor {
  const s = req.storeUser;
  return s?.user_id
    ? { type: 'store_user', id: s.user_id, login: s.login ?? null, ip: req.ip }
    : { type: 'service', id: null, login: null, ip: req.ip };
}

/**
 * Sinov ma'lumotlari (topshiriq №43, 2-band) — faqat superadmin.
 * Tozalash (`purge`) faqat superadmin HISOBI tokeni bilan — servis kaliti bilan 403.
 */
@ApiTags('Admin: sinov ma\'lumotlari')
@ApiBearerAuth()
@UseGuards(StoreAuthGuard, SuperadminGuard)
@Controller('admin')
export class TestDataController {
  constructor(private readonly service: TestDataService) {}

  @ApiOperation({ summary: 'Yozuvni sinov deb belgilash / belgini olish' })
  @Patch('test-flag')
  setFlag(@Body() dto: TestFlagDto, @Req() req: any) {
    return this.service.setFlag(dto.entity, dto.id, dto.is_test, actorOf(req));
  }

  @ApiOperation({ summary: "Tozalanadiganlar (quruq yurish) — hech narsa o'chmaydi" })
  @ApiQuery({ name: 'entity', required: false, enum: PURGE_ROOTS, description: 'items ro\'yxati turi (standart orders)' })
  @ApiQuery({ name: 'entities', required: false, description: 'vergul bilan: orders,users,...' })
  @ApiQuery({ name: 'before', required: false, example: '2026-09-28' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Get('test-data')
  preview(
    @Query('entity') entity?: string,
    @Query('entities') entities?: string,
    @Query('before') before?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.preview({
      entity,
      entities: entities ? entities.split(',') : undefined,
      before,
      page: Number(page) || 1,
      limit: Number(limit) || 50,
    });
  }

  @ApiOperation({ summary: "Sinov ma'lumotlarini tozalash (bitta tranzaksiya)" })
  @ApiResponse({ status: 200, schema: { example: { deleted: { orders: 12 }, skipped: [], files_removed: 3 } } })
  @ApiResponse({ status: 403, description: 'Servis kaliti yoki superadmin emas' })
  @HttpCode(200)
  @Post('test-data/purge')
  purge(@Body() dto: PurgeDto, @Req() req: any) {
    return this.service.purge(dto, actorOf(req));
  }
}

@Module({
  imports: [JwtModule.register({}), CloudinaryModule],
  controllers: [TestDataController],
  providers: [TestDataService, R2DocumentsStore],
})
export class TestDataModule {}
