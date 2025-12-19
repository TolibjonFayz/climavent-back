import { Module } from '@nestjs/common';
import { CharacteristicsService } from './characteristics.service';
import { CharacteristicsController } from './characteristics.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { Characteristic } from './model/characteristic.model';
import { R2Service } from 'src/r2/r2.service';

@Module({
  imports: [SequelizeModule.forFeature([Characteristic])],
  controllers: [CharacteristicsController],
  providers: [CharacteristicsService, R2Service],
  exports: [CharacteristicsService],
})
export class CharacteristicsModule {}
