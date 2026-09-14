import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { StoreUser } from 'src/store_users/model/store_user.model';
import { Store } from 'src/stores/model/store.model';
import { StoreAuthService } from './store_auth.service';
import { StoreAuthController } from './store_auth.controller';
import { PasswordSetupService } from './password-setup.service';

@Module({
  imports: [
    SequelizeModule.forFeature([StoreUser, Store]),
    JwtModule.register({}),
  ],
  controllers: [StoreAuthController],
  providers: [StoreAuthService, PasswordSetupService],
  exports: [StoreAuthService, PasswordSetupService],
})
export class StoreAuthModule {}
