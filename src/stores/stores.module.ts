import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Store } from './model/store.model';
import { Product } from 'src/products/model/product.model';
import { JwtModule } from '@nestjs/jwt';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { StoreRequisites } from './model/store-requisites.model';
import { StoreEvent } from './model/store-event.model';

@Module({
  imports: [SequelizeModule.forFeature([Store, Product, StoreRequisites, StoreEvent]),
    JwtModule.register({})],
  controllers: [StoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
