import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { Setting } from './model/setting.model';

@Module({
  imports: [SequelizeModule.forFeature([Setting]), JwtModule.register({})],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
