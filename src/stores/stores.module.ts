import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Store } from './model/store.model';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';

@Module({
  imports: [SequelizeModule.forFeature([Store])],
  controllers: [StoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
