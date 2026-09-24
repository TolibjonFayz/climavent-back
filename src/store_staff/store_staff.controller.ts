import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';
import { CreateStaffDto, CreateStoreRoleDto, UpdateStaffDto, UpdateStoreRoleDto } from './dto';
import { StoreStaffService } from './store_staff.service';

const sid = (v?: string) => (v ? Number(v) || undefined : undefined);

/**
 * Do'kon rollari (topshiriq №35, 2-band). `store_id` — tokendan;
 * superadmin — `?store_id=` / tanada. Ruxsat: `staff.view` / `staff.edit`.
 */
@ApiTags('Store staff')
@ApiBearerAuth()
@ApiSecurity('service-key')
@UseGuards(StoreAuthGuard)
@Controller('store-roles')
export class StoreRolesController {
  constructor(private readonly staff: StoreStaffService) {}

  @ApiOperation({ summary: "Rollar ro'yxati (staff_count bilan)" })
  @Get()
  list(@Req() req: any, @Query('store_id') storeId?: string) {
    return this.staff.listRoles(req.storeUser, sid(storeId));
  }

  @ApiOperation({ summary: 'Rol yaratish (bog\'liq *.view lar avtomatik qo\'shiladi)' })
  @ApiResponse({ status: 403, description: "Xodim o'zida yo'q ruxsatli rol yarata olmaydi" })
  @Post()
  create(@Body() dto: CreateStoreRoleDto, @Req() req: any) {
    return this.staff.createRole(req.storeUser, dto);
  }

  @ApiOperation({ summary: "Rolni tahrirlash (ruxsatlar o'zgarsa — shu roldagi xodimlar chiqariladi)" })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStoreRoleDto,
    @Req() req: any,
    @Query('store_id') storeId?: string,
  ) {
    return this.staff.updateRole(req.storeUser, id, dto, sid(storeId));
  }

  @ApiOperation({ summary: "Rolni o'chirish (xodim bo'lsa — 409)" })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any, @Query('store_id') storeId?: string) {
    return this.staff.deleteRole(req.storeUser, id, sid(storeId));
  }
}

/**
 * Do'kon xodimlari (topshiriq №35, 3-band) — `store_users` dagi `store_staff`.
 * `store_admin` va kuryer bu yerda ko'rinmaydi va o'zgarmaydi (404).
 */
@ApiTags('Store staff')
@ApiBearerAuth()
@ApiSecurity('service-key')
@UseGuards(StoreAuthGuard)
@Controller('store-staff')
export class StoreStaffController {
  constructor(private readonly staff: StoreStaffService) {}

  @ApiOperation({ summary: "Xodimlar ro'yxati" })
  @Get()
  list(@Req() req: any, @Query('store_id') storeId?: string) {
    return this.staff.listStaff(req.storeUser, sid(storeId));
  }

  @ApiOperation({ summary: 'Xodim yaratish (login + parol + rol)' })
  @ApiResponse({ status: 409, description: 'login band' })
  @Post()
  create(@Body() dto: CreateStaffDto, @Req() req: any) {
    return this.staff.createStaff(req.storeUser, dto);
  }

  @ApiOperation({ summary: 'Xodimni tahrirlash (rol/nofaol/parol — sessiyalar bekor)' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStaffDto,
    @Req() req: any,
    @Query('store_id') storeId?: string,
  ) {
    return this.staff.updateStaff(req.storeUser, id, dto, sid(storeId));
  }

  @ApiOperation({ summary: "Xodimni o'chirish (kirish jurnali saqlanadi)" })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any, @Query('store_id') storeId?: string) {
    return this.staff.deleteStaff(req.storeUser, id, sid(storeId));
  }

  @ApiOperation({ summary: "Parol o'rnatish havolasi uchun token (zaxira yo'l)" })
  @ApiResponse({ status: 201, schema: { example: { password_setup_token: '9c1e…', expires_at: '2026-09-27T09:30:00Z' } } })
  @Post(':id/password-setup')
  passwordSetup(@Param('id', ParseIntPipe) id: number, @Req() req: any, @Query('store_id') storeId?: string) {
    return this.staff.passwordSetupToken(req.storeUser, id, sid(storeId));
  }
}
