import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { OfferVersion } from './model/offer-version.model';
import { OfferAcceptance } from './model/offer-acceptance.model';
import { ConsentService } from './consent.service';

// Hujjat versiyalari va rozilik dalili — sotuvchi arizasi (№16) va xaridor
// ro'yxatdan o'tishi (№18) bitta servisdan foydalanadi.
@Module({
  imports: [SequelizeModule.forFeature([OfferVersion, OfferAcceptance])],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class OffersModule {}
