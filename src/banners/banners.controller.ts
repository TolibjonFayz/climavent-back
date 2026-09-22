import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { BannersService } from './banners.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Banner } from './model/banner.model';
import { Scope } from 'src/common/decorators/scope.decorator';
import type { CatalogScope } from 'src/common/visibility/catalog-visibility';
import { JwtOrServiceKeyGuard } from 'src/guards/jwt_or_service_key.guard';

@ApiTags('Banners')
@Controller('banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  //Create banner
  @ApiOperation({ summary: 'Create banner' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Post('create')
  async create(@Body() createBannerDto: CreateBannerDto) {
    return this.bannersService.createBanner(createBannerDto);
  }

  // Mehmonga faqat FAOL bannerlar (topshiriq №19, 5-band), adminkaga hammasi.
  @ApiOperation({ summary: "Bannerlar (mehmonga faqat faollari)" })
  @Get('all')
  async getAll(@Scope() scope: CatalogScope): Promise<Banner[]> {
    return this.bannersService.getAllBanners(scope);
  }

  //Get banner by id
  @ApiOperation({ summary: 'Get banner by id' })
  @Get('one/:id')
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @Scope() scope: CatalogScope,
  ): Promise<Banner> {
    return this.bannersService.getBannerById(id, scope);
  }

  //Update banner by id
  @ApiOperation({ summary: 'Update banner by id' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateBannerDto: UpdateBannerDto,
  ) {
    return this.bannersService.updateBannerById(id, updateBannerDto);
  }

  //Delete banner by id
  @ApiOperation({ summary: 'Delete banner by id' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id', ParseIntPipe) id: number) {
    return this.bannersService.deleteBannerById(id);
  }
}
