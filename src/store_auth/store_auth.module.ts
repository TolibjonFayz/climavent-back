import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { StoreUser } from 'src/store_users/model/store_user.model';
import { Store } from 'src/stores/model/store.model';
import { StoreAuthService } from './store_auth.service';
import { StoreAuthController } from './store_auth.controller';
import { PasswordSetupService } from './password-setup.service';
import { OffersModule } from 'src/offers/offers.module';
import { StoreUserLogin } from './model/store-user-login.model';
import { StoreAuthJobs } from './store-auth.jobs';

@Module({
  imports: [
    SequelizeModule.forFeature([StoreUser, Store, StoreUserLogin]),
    JwtModule.register({}),
    // Kirishda "yangi versiyani tasdiqlang" signali uchun (№20, 2-band)
    OffersModule,
  ],
  controllers: [StoreAuthController],
  providers: [StoreAuthService, PasswordSetupService, StoreAuthJobs],
  exports: [StoreAuthService, PasswordSetupService],
})
export class StoreAuthModule {}
