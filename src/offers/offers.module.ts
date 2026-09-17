import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { OfferVersion } from './model/offer-version.model';
import { OfferAcceptance } from './model/offer-acceptance.model';
import { ConsentService } from './consent.service';
import { OfferConsentController } from './offers.controller';

// Hujjat versiyalari va rozilik dalili — sotuvchi arizasi (№16), xaridor
// ro'yxatdan o'tishi (№18) va kabinetda majburiy tasdiqlash (№20) bitta
// servisdan foydalanadi.
@Module({
  imports: [
    SequelizeModule.forFeature([OfferVersion, OfferAcceptance]),
    // `StoreAuthGuard` uchun
    JwtModule.register({}),
  ],
  controllers: [OfferConsentController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class OffersModule {}
