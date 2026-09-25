import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';
import { SuperadminGuard } from 'src/store_auth/superadmin.guard';
import { validateListBody } from 'src/common/helpers/validate-body';
import { SERVICE_CATALOG_MODELS } from './models';
import { ServiceCatalogService } from './service-catalog.service';
import {
  CreateServiceDto,
  ServiceAreasDto,
  ServiceCategoryDto,
  ServiceLinkDto,
  ServiceLinksDto,
  UpdateServiceCategoryDto,
  UpdateServiceDto,
  UpdateVariantDto,
  VariantDto,
} from './dto';

/**
 * Xizmatlar katalogi (topshiriq №39, 3-band).
 *
 * `GET` yo'llari UMUMIY: tokensiz — xaridor ko'rinishi (faqat faol), hamkor
 * tokeni / servis kaliti bilan — orqa ofis ko'rinishi (o'ziniki, nofaollari
 * bilan). Yozish — `StoreAuthGuard` (hamkor admini, ruxsatli xodim, superadmin).
 */
@ApiTags('Services')
@Controller('services')
export class ServicesController {
  constructor(private readonly catalog: ServiceCatalogService) {}

  @ApiOperation({
    summary: "Xizmatlar (?category=&region=&district=&store_id=&product_id=&sort=price|rating&page=&limit=)",
    description:
      "Tokensiz — xaridor ro'yxati `{rows,total,page,limit}`: faqat faol xizmat va hamkor, `min_price_uzs` va hamkor bilan. " +
      "Hamkor tokeni bilan — o'z xizmatlari (nofaol ham) massiv bo'lib.",
  })
  @Get()
  list(@Query() q: Record<string, any>, @Req() req: any) {
    const scope = ServiceCatalogService.backofficeOf(req.viewer);
    return scope ? this.catalog.backofficeList(scope, q) : this.catalog.publicList(q);
  }

  @ApiOperation({ summary: 'Bitta xizmat: variantlar, hamkor, reyting, kafolat' })
  @ApiResponse({ status: 404, description: 'Topilmadi yoki nofaol' })
  @Get(':id')
  one(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const scope = ServiceCatalogService.backofficeOf(req.viewer);
    return scope ? this.catalog.backofficeGet(id, scope) : this.catalog.publicOne(id);
  }

  @ApiOperation({ summary: "Xizmat yaratish (hamkor — o'ziga; `sells_services=false` — 403)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard)
  @Post()
  create(@Body() dto: CreateServiceDto, @Req() req: any) {
    return this.catalog.create(dto, req.storeUser);
  }

  @ApiOperation({ summary: 'Xizmatni tahrirlash (narx — `prices.edit`)' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateServiceDto, @Req() req: any) {
    return this.catalog.update(id, dto, req.storeUser);
  }

  @ApiOperation({ summary: "O'chirish — buyurtmada ishlatilgan bo'lsa `is_active=false`" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.catalog.remove(id, req.storeUser);
  }

  @ApiOperation({ summary: "Variant qo'shish" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard)
  @Post(':id/variants')
  addVariant(@Param('id', ParseIntPipe) id: number, @Body() dto: VariantDto, @Req() req: any) {
    return this.catalog.addVariant(id, dto, req.storeUser);
  }

  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard)
  @Patch(':id/variants/:variantId')
  updateVariant(
    @Param('id', ParseIntPipe) id: number,
    @Param('variantId', ParseIntPipe) variantId: number,
    @Body() dto: UpdateVariantDto,
    @Req() req: any,
  ) {
    return this.catalog.updateVariant(id, variantId, dto, req.storeUser);
  }

  @ApiOperation({ summary: "Variantni o'chirish (oxirgi faol variant — 409)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard)
  @Delete(':id/variants/:variantId')
  removeVariant(
    @Param('id', ParseIntPipe) id: number,
    @Param('variantId', ParseIntPipe) variantId: number,
    @Req() req: any,
  ) {
    return this.catalog.removeVariant(id, variantId, req.storeUser);
  }

  @ApiOperation({ summary: "Tovarga bog'lash — ro'yxat to'liq almashadi: [{ variant_id?, category_id? | product_id? }]" })
  @ApiBody({ type: [ServiceLinkDto] })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard)
  @Put(':id/links')
  async links(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Req() req: any) {
    const dto = await validateListBody(ServiceLinksDto, 'links', body);
    return this.catalog.setLinks(id, dto, req.storeUser);
  }
}

@ApiTags('Services')
@Controller('service-categories')
export class ServiceCategoriesController {
  constructor(private readonly catalog: ServiceCatalogService) {}

  @ApiOperation({ summary: "Xizmat turlari (tokensiz — faqat faollari)" })
  @Get()
  list(@Req() req: any) {
    const kind = req.viewer?.kind;
    return this.catalog.categories(kind === 'service' || kind === 'superadmin');
  }

  @ApiOperation({ summary: "Xizmat turi qo'shish (faqat superadmin)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @Post()
  create(@Body() dto: ServiceCategoryDto) {
    return this.catalog.createCategory(dto);
  }

  @ApiOperation({ summary: "Xizmat turini tahrirlash (faqat superadmin; `key` o'zgarmaydi)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, SuperadminGuard)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateServiceCategoryDto) {
    return this.catalog.updateCategory(id, dto);
  }
}

/** Xizmat hududi (1-band) — `/api/stores/:id/service-areas`. */
@ApiTags('Stores')
@Controller('stores')
export class StoreServiceAreasController {
  constructor(private readonly catalog: ServiceCatalogService) {}

  @ApiOperation({ summary: "Hamkorning xizmat hududi (tokensiz)" })
  @Get(':id/service-areas')
  list(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.areas(id);
  }

  @ApiOperation({ summary: "Xizmat hududi — ro'yxat to'liq almashadi: [{ region_code, district_code? }]" })
  @ApiBody({ type: ServiceAreasDto })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard)
  @Put(':id/service-areas')
  async set(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Req() req: any) {
    const dto = await validateListBody(ServiceAreasDto, 'areas', body);
    return this.catalog.setAreas(id, dto, req.storeUser);
  }
}

/** Savatda "O'rnatib berish" (6-band) — `/api/products/:id/services`. */
@ApiTags('Services')
@Controller('products')
export class ProductServicesController {
  constructor(private readonly catalog: ServiceCatalogService) {}

  @ApiOperation({
    summary: "Shu tovarga mos xizmatlar (?region=&district=)",
    description: "Avval shu tovarni sotayotgan do'konning o'z xizmati (`recommended: true`), keyin reyting bo'yicha. `suggested_variant_id` — bog'langan variant",
  })
  @Get(':id/services')
  forProduct(@Param('id', ParseIntPipe) id: number, @Query() q: Record<string, any>) {
    return this.catalog.forProduct(id, q);
  }
}

@Module({
  imports: [SequelizeModule.forFeature(SERVICE_CATALOG_MODELS)],
  controllers: [ServiceCategoriesController, StoreServiceAreasController, ProductServicesController, ServicesController],
  providers: [ServiceCatalogService],
  exports: [ServiceCatalogService],
})
export class ServiceCatalogModule {}
