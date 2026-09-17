import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { Setting } from './model/setting.model';
import { SettingEvent } from './model/setting-event.model';
import { CbuService } from './cbu.service';
import { UsdRateJobs } from './usd-rate.jobs';

@Module({
  imports: [SequelizeModule.forFeature([Setting, SettingEvent]), JwtModule.register({})],
  controllers: [SettingsController],
  providers: [SettingsService, CbuService, UsdRateJobs],
  exports: [SettingsService],
})
export class SettingsModule {}
