import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { StoreUser } from './model/store_user.model';
import { Store } from 'src/stores/model/store.model';
import { StoreUsersService } from './store_users.service';
import { StoreUsersController } from './store_users.controller';

@Module({
  imports: [
    SequelizeModule.forFeature([StoreUser, Store]),
    JwtModule.register({}),
  ],
  controllers: [StoreUsersController],
  providers: [StoreUsersService],
  exports: [StoreUsersService],
})
export class StoreUsersModule {}
