import { Module } from '@nestjs/common';
import { ProductModelHeadersService } from './product_model_headers.service';
import { ProductModelHeadersController } from './product_model_headers.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { ProductModelHeader } from './models/product_model_header.model';

@Module({
  imports: [SequelizeModule.forFeature([ProductModelHeader])],
  controllers: [ProductModelHeadersController],
  providers: [ProductModelHeadersService],
  exports: [ProductModelHeadersService],
})
export class ProductModelHeadersModule {}
