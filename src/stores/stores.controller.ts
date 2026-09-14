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
import { Privileged } from 'src/common/decorators/privileged.decorator';
import { CurrentViewer } from 'src/common/decorators/viewer.decorator';
import type { Viewer } from 'src/common/middleware/viewer_scope.middleware';
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
  async getAll(
    @Query('active') active?: string,
    @Privileged() privileged?: boolean,
    @CurrentViewer() viewer?: Viewer,
  ) {
    // Yopiq rekvizitlar faqat o'z do'koni va superadminga (№16, 8-band)
    return this.storesService.present(
      await this.storesService.getAll(active === 'true', privileged),
      viewer,
    );
  }

  @ApiOperation({ summary: "Bitta do'kon" })
  @ApiResponse({ status: 200, type: Store })
  @ApiResponse({ status: 404, description: "Do'kon topilmadi" })
  @Get('one/:id')
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @Privileged() privileged: boolean,
    @CurrentViewer() viewer: Viewer,
  ) {
    return this.storesService.present(await this.storesService.getOne(id, privileged), viewer);
  }

  @ApiOperation({ summary: "Do'kon slug bo'yicha (sayt sahifasi uchun)" })
  @ApiResponse({ status: 200, type: Store })
  @ApiResponse({ status: 404, description: "Do'kon topilmadi" })
  @Get('slug/:slug')
  async getBySlug(
    @Param('slug') slug: string,
    @Privileged() privileged: boolean,
    @CurrentViewer() viewer: Viewer,
  ) {
    return this.storesService.present(await this.storesService.getBySlug(slug, privileged), viewer);
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

  // store_admin o'z do'konining profili va bank rekvizitlarini, superadmin
  // — hammasini (is_active, nom, slug, yuridik nom, STIR ham).
  @ApiOperation({ summary: "Do'konni tahrirlash (qismiy)" })
  @ApiResponse({ status: 403, description: "Boshqa do'kon yoki faqat superadmin maydoni (is_active, name, slug, legal_name, tin, ...)" })
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
    // Maydon darajasidagi ruxsat (is_active, nom, rekvizitlar) — servisda
    const updated = await this.storesService.update(id, dto, requester);
    return this.storesService.present(updated, req.viewer);
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
