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

// DIQQAT: hech bir javobda `password_hash` qaytmaydi — StoreUser
// modelidagi `toJSON` uni chiqarib tashlaydi.
@ApiTags('Store users')
@ApiBearerAuth()
@ApiSecurity('service-key')
@UseGuards(StoreAuthGuard)
@Controller('store-users')
export class StoreUsersController {
  constructor(private readonly storeUsersService: StoreUsersService) {}

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
