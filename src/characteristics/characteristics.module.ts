import { Module } from '@nestjs/common';
import { CharacteristicsService } from './characteristics.service';
import { CharacteristicsController } from './characteristics.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { Characteristic } from './model/characteristic.model';

@Module({
  imports: [SequelizeModule.forFeature([Characteristic])],
  controllers: [CharacteristicsController],
  providers: [CharacteristicsService],
  exports: [CharacteristicsService],
})
export class CharacteristicsModule {}
