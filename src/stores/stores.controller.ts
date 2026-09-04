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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { StoresService } from './stores.service';
import { Store } from './model/store.model';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';
import { SuperadminGuard } from 'src/store_auth/superadmin.guard';

@ApiTags('Stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @ApiOperation({ summary: "Do'konlar ro'yxati" })
  @ApiQuery({
    name: 'active',
    required: false,
    description: "`true` bo'lsa faqat faol do'konlar (sayt uchun)",
    example: 'true',
  })
  @ApiResponse({ status: 200, type: [Store] })
  @Get('all')
  async getAll(@Query('active') active?: string): Promise<Store[]> {
    return this.storesService.getAll(active === 'true');
  }

  @ApiOperation({ summary: "Bitta do'kon" })
  @ApiResponse({ status: 200, type: Store })
  @ApiResponse({ status: 404, description: "Do'kon topilmadi" })
  @Get('one/:id')
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<Store> {
    return this.storesService.getOne(id);
  }

  @ApiOperation({ summary: "Do'kon slug bo'yicha (sayt sahifasi uchun)" })
  @ApiResponse({ status: 200, type: Store })
  @ApiResponse({ status: 404, description: "Do'kon topilmadi" })
  @Get('slug/:slug')
  async getBySlug(@Param('slug') slug: string): Promise<Store> {
    return this.storesService.getBySlug(slug);
  }

  @ApiOperation({ summary: "Do'kon yaratish (superadmin)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        message: "Do'kon yaratildi",
        store: { id: 3, name: 'Yangi do\'kon', slug: 'yangi-dokon' },
      },
    },
  })
  @ApiResponse({ status: 409, description: 'slug band' })
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @Post('create')
  async create(@Body() dto: CreateStoreDto) {
    return this.storesService.create(dto);
  }

  // store_admin o'z do'konini tahrirlashi mumkin, superadmin — hammasini.
  @ApiOperation({ summary: "Do'konni tahrirlash" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiResponse({ status: 200, type: Store })
  @ApiResponse({ status: 403, description: "Boshqa do'kon" })
  @UseGuards(StoreAuthGuard)
  @Patch('update/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStoreDto,
    @Req() req: any,
  ) {
    const requester = req.storeUser;
    if (
      requester?.role !== 'superadmin' &&
      Number(requester?.store_id) !== id
    ) {
      return this.storesService.forbidOtherStore();
    }
    return this.storesService.update(id, dto);
  }

  @ApiOperation({ summary: "Do'konni o'chirish (superadmin)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiResponse({ status: 200, description: "O'chirildi" })
  @ApiResponse({
    status: 409,
    description: "Do'konda mahsulot bor — o'chirilmaydi",
  })
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @Delete('delete/:id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.storesService.remove(id);
  }
}
