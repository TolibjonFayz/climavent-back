import { Global, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { Product } from 'src/products/model/product.model';
import { Characteristic } from 'src/characteristics/model/characteristic.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';
import { ProductImages } from 'src/product_images/model/product_image.model';
import { StoreAuthGuard } from './store_auth.guard';
import { StoreScopeGuard } from './store_scope.guard';
import { SuperadminGuard } from './superadmin.guard';

// Guard'lar bir nechta modulda ishlatiladi (products, characteristics,
// product-model-inside, product-images, stores), shuning uchun Global —
// har bir modulda qayta ro'yxatdan o'tkazish shart bo'lmasin.
@Global()
@Module({
  imports: [
    SequelizeModule.forFeature([
      Product,
      Characteristic,
      ProductModelInside,
      ProductImages,
    ]),
    JwtModule.register({}),
  ],
  providers: [StoreAuthGuard, StoreScopeGuard, SuperadminGuard],
  exports: [
    StoreAuthGuard,
    StoreScopeGuard,
    SuperadminGuard,
    JwtModule,
    SequelizeModule,
  ],
})
export class StoreScopeModule {}
