import { ProductModelInsideController } from './product_model_inside.controller';
import { ProductModelInsideService } from './product_model_inside.service';
import { ProductModelInside } from './models/product_model_inside.model';
import { SequelizeModule } from '@nestjs/sequelize';
import { Module } from '@nestjs/common';

@Module({
  imports: [SequelizeModule.forFeature([ProductModelInside])],
  controllers: [ProductModelInsideController],
  providers: [ProductModelInsideService],
})
export class ProductModelInsideModule {}
