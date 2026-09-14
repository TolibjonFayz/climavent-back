import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { SellerApplication } from './model/seller-application.model';
import { SellerApplicationEvent } from './model/seller-application-event.model';
import { SellerApplicationDocument } from './model/seller-application-document.model';
import { SellerApplicationDocumentBlob } from './model/seller-application-document-blob.model';
import { OfferVersion } from 'src/offers/model/offer-version.model';
import { OfferAcceptance } from 'src/offers/model/offer-acceptance.model';
import { Store } from 'src/stores/model/store.model';
import { StoreRequisites } from 'src/stores/model/store-requisites.model';
import { StoreUser } from 'src/store_users/model/store_user.model';
import { StoreAuthModule } from 'src/store_auth/store_auth.module';
import { SellerApplicationsService } from './seller-applications.service';
import { SellerApplicationsController } from './seller-applications.controller';
import { OffersController } from './offers.controller';
import { DocumentStorageService } from './document-storage.service';
import { SellerApplicationsJobs } from './seller-applications.jobs';

@Module({
  imports: [
    SequelizeModule.forFeature([
      SellerApplication,
      SellerApplicationEvent,
      SellerApplicationDocument,
      SellerApplicationDocumentBlob,
      OfferVersion,
      OfferAcceptance,
      Store,
      StoreRequisites,
      StoreUser,
    ]),
    JwtModule.register({}),
    StoreAuthModule,
  ],
  controllers: [SellerApplicationsController, OffersController],
  providers: [SellerApplicationsService, DocumentStorageService, SellerApplicationsJobs],
})
export class SellerApplicationsModule {}
