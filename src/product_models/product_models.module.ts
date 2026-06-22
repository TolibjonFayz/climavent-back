import { Module } from '@nestjs/common';
import { ProductModelsService } from './product_models.service';
import { ProductModelsController } from './product_models.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { ProductModels } from './models/product_model.model';

@Module({
  imports: [SequelizeModule.forFeature([ProductModels])],
  controllers: [ProductModelsController],
  providers: [ProductModelsService],
  exports: [ProductModelsService],
})
export class ProductModelsModule {}
