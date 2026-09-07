import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { Review } from './model/review.model';
import { Product } from 'src/products/model/product.model';

@Module({
  imports: [SequelizeModule.forFeature([Review, Product]), JwtModule.register({})],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
