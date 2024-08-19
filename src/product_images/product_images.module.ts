import { Module } from '@nestjs/common';
import { ProductImagesService } from './product_images.service';
import { ProductImagesController } from './product_images.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { ProductImages } from './model/product_image.model';

@Module({
  imports: [SequelizeModule.forFeature([ProductImages])],
  controllers: [ProductImagesController],
  providers: [ProductImagesService],
  exports: [ProductImagesService],
})
export class ProductImagesModule {}
