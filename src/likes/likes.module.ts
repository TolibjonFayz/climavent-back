import { Module } from '@nestjs/common';
import { LikesService } from './likes.service';
import { LikesController } from './likes.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { Like } from './model/like.model';
import { Product } from 'src/products/model/product.model';

@Module({
  imports: [SequelizeModule.forFeature([Like, Product]), JwtModule.register({})],
  controllers: [LikesController],
  providers: [LikesService],
  exports: [LikesService],
})
export class LikesModule {}
