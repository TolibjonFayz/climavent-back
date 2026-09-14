import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { StoreUsersService } from './store_users.service';
import { CreateStoreUserDto } from './dto/create-store-user.dto';
import { UpdateStoreUserDto } from './dto/update-store-user.dto';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';
import { SuperadminGuard } from 'src/store_auth/superadmin.guard';
import { PasswordSetupService } from 'src/store_auth/password-setup.service';

// DIQQAT: hech bir javobda `password_hash` qaytmaydi — StoreUser
// modelidagi `toJSON` uni chiqarib tashlaydi.
@ApiTags('Store users')
@ApiBearerAuth()
@ApiSecurity('service-key')
@UseGuards(StoreAuthGuard)
@Controller('store-users')
export class StoreUsersController {
  constructor(
    private readonly storeUsersService: StoreUsersService,
    private readonly passwordSetup: PasswordSetupService,
  ) {}

  // Yangi parol o'rnatish havolasi (topshiriq №16, 7-band) — sotuvchi
  // havolani yo'qotsa, muddati o'tsa yoki parolini unutsa. Faqat superadmin.
  // Eski token o'z-o'zidan bekor bo'ladi; mavjud parol esa yangisi
  // o'rnatilguncha ishlayveradi.
  @ApiOperation({ summary: "Parol o'rnatish havolasi uchun token (superadmin)" })
  @ApiResponse({
    status: 201,
    schema: { example: { password_setup_token: '9c1e…', expires_at: '2026-09-17T09:30:00Z' } },
  })
  @UseGuards(SuperadminGuard)
  @Post(':id/password-setup')
  async passwordSetupToken(@Param('id', ParseIntPipe) id: number) {
    return this.passwordSetup.issue(id);
  }

  @ApiOperation({ summary: "Hisoblar ro'yxati (o'z do'koni yoki hammasi)" })
  @ApiResponse({ status: 200, description: 'Hisoblar' })
  @Get('all')
  async getAll(@Req() req: any) {
    return this.storeUsersService.getAll(req.storeUser);
  }

  @ApiOperation({ summary: 'Hisob yaratish' })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        message: 'Hisob yaratildi',
        storeUser: {
          id: 1,
          login: 'jihozvent_admin',
          role: 'store_admin',
          store_id: 2,
        },
      },
    },
  })
  @ApiResponse({ status: 409, description: 'login band' })
  @Post('create')
  async create(@Body() dto: CreateStoreUserDto, @Req() req: any) {
    return this.storeUsersService.create(dto, req.storeUser);
  }

  @ApiOperation({ summary: 'Hisobni tahrirlash (parol ham shu yerda)' })
  @ApiResponse({ status: 200, description: 'Yangilandi' })
  @ApiResponse({ status: 403, description: "Boshqa do'kon hisobi" })
  @Patch('update/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStoreUserDto,
    @Req() req: any,
  ) {
    return this.storeUsersService.update(id, dto, req.storeUser);
  }

  @ApiOperation({ summary: "Hisobni o'chirish" })
  @ApiResponse({ status: 200, description: "O'chirildi" })
  @Delete('delete/:id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.storeUsersService.remove(id, req.storeUser);
  }
}
