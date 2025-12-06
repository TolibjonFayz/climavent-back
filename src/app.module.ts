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
import { CategoryModule } from './category/category.module';
import { ProductModelsModule } from './product_models/product_models.module';
import { ProductModelHeadersModule } from './product_model_headers/product_model_headers.module';
import { ProductModelInfosModule } from './product_model_infos/product_model_infos.module';
import { CartModule } from './cart/cart.module';
import { CartItemsModule } from './cart_items/cart_items.module';
import { OrdersModule } from './orders/orders.module';
import { OrderItemsModule } from './order_items/order_items.module';
import { SelectedToCheckoutModule } from './selected_to_checkout/selected_to_checkout.module';
import { RishotkalarModule } from './rishotkalar/rishotkalar.module';
import { CharacteristicsModule } from './characteristics/characteristics.module';

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
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      },
      models: [User, Otp],
    }),
    UsersModule,
    ProductsModule,
    ProductImagesModule,
    CategoryModule,
    ReviewsModule,
    OtpModule,
    LikesModule,
    BannersModule,
    ProductModelsModule,
    ProductModelHeadersModule,
    ProductModelInfosModule,
    CartModule,
    CartItemsModule,
    OrdersModule,
    OrderItemsModule,
    SelectedToCheckoutModule,
    RishotkalarModule,
    CharacteristicsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
