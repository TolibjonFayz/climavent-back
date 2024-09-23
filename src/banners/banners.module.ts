import { Module } from '@nestjs/common';
import { BannersService } from './banners.service';
import { BannersController } from './banners.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { Banner } from './model/banner.model';

@Module({
  imports: [SequelizeModule.forFeature([Banner])],
  controllers: [BannersController],
  providers: [BannersService],
  exports: [BannersService],
})
export class BannersModule {}
