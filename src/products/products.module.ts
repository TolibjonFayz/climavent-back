import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { Product } from './model/product.model';
import { Category } from 'src/category/model/category.model';
import { R2Service } from 'src/r2/r2.service';

@Module({
  imports: [SequelizeModule.forFeature([Product, Category])],
  controllers: [ProductsController],
  providers: [ProductsService, R2Service],
  exports: [ProductsService],
})
export class ProductsModule {}
