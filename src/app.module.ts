import { ProductImagesModule } from './product_images/product_images.module';
import { ProductsModule } from './products/products.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SequelizeModule } from '@nestjs/sequelize';
import { UsersModule } from './users/users.module';
import { User } from './users/model/user.model';
import { ConfigModule } from '@nestjs/config';
import { OtpModule } from './otp/otp.module';
import { Otp } from './otp/models/otp.model';
import { Module } from '@nestjs/common';
import { LikesModule } from './likes/likes.module';
import { BannersModule } from './banners/banners.module';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
    SequelizeModule.forRoot({
      dialect: 'postgres',
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT),
      username: process.env.POSTGRES_USER,
      password: String(process.env.POSTGRES_PASSWORD),
      database: process.env.POSTGRES_DB,
      autoLoadModels: true,
      logging: false,
      models: [User, Otp],
    }),
    ProductImagesModule,
    ProductsModule,
    ReviewsModule,
    UsersModule,
    OtpModule,
    LikesModule,
    BannersModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
