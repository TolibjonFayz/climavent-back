import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { BannersService } from './banners.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Banner } from './model/banner.model';

@ApiTags('Banners')
@Controller('banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  //Create banner
  @ApiOperation({ summary: 'Create banner' })
  @Post('create')
  async create(@Body() createBannerDto: CreateBannerDto) {
    return this.bannersService.createBanner(createBannerDto);
  }

  //Get all banners
  @ApiOperation({ summary: 'Get all banners' })
  @Get('all')
  async getAll(): Promise<Banner[]> {
    return this.bannersService.getAllBanners();
  }

  //Get banner by id
  @ApiOperation({ summary: 'Get banner by id' })
  @Get('one/:id')
  async getOne(@Param('id') id: number): Promise<Banner> {
    return this.bannersService.getBannerById(id);
  }

  //Update banner by id
  @ApiOperation({ summary: 'Update banner by id' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateBannerDto: UpdateBannerDto,
  ) {
    return this.bannersService.updateBannerById(id, updateBannerDto);
  }

  //Delete banner by id
  @ApiOperation({ summary: 'Delete banner by id' })
  @Delete('delete/:id')
  async deleteOne(@Param('id') id: number) {
    return this.bannersService.deleteBannerById(id);
  }
}
