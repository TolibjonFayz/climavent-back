import { Module } from '@nestjs/common';
import { ProductModelInfosService } from './product_model_infos.service';
import { ProductModelInfosController } from './product_model_infos.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { ProductModelInfo } from './models/product_model_info.model';

@Module({
  imports: [SequelizeModule.forFeature([ProductModelInfo])],
  controllers: [ProductModelInfosController],
  providers: [ProductModelInfosService],
  exports: [ProductModelInfosService],
})
export class ProductModelInfosModule {}
