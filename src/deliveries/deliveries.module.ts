import { Injectable, Logger, Module, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { Op } from 'sequelize';
import { StoreUser } from 'src/store_users/model/store_user.model';
import { StoreAuthModule } from 'src/store_auth/store_auth.module';
import { OtpModule } from 'src/otp/otp.module';
import { R2DocumentsStore } from 'src/seller_applications/r2-documents.store';
import { CourierLocation, DELIVERY_MODELS } from './model/models';
import { CouriersService } from './couriers.service';
import { DeliveriesService } from './deliveries.service';
import { ProofStorageService } from './proof-storage.service';
import { CouriersController, DeliveriesController } from './deliveries.controller';
import { CourierAppController, DevicesController } from './courier-app.controller';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { CourierDocumentsService } from './courier-documents.service';
import { CourierVehiclesService } from './courier-vehicles.service';
import { CourierWorkService } from './courier-work.service';
import {
  CourierAdminController,
  CourierDocumentFileController,
  CourierRatesController,
} from './courier-admin.controller';
import { CourierGuard } from './courier.guard';
import { LOCATION_RETENTION_MS } from './constants';

const HOUR = 60 * 60 * 1000;

/**
 * Fon ishlari (topshiriq —22):
 *   - yo'l tarixi 30 kundan keyin o'chiriladi (6-band);
 *   - kuryerda 24 soatdan ortiq topshirilmagan naqd — adminlarga push (9-band).
 */
@Injectable()
export class DeliveriesJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DeliveriesJobs.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly couriers: CouriersService,
    private readonly documents: CourierDocumentsService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.SELLER_JOBS_DISABLED === 'true') return;
    setTimeout(() => this.tick(), 3 * 60 * 1000).unref();
    this.timer = setInterval(() => this.tick(), HOUR);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    try {
      const n = await CourierLocation.destroy({
        where: { created_at: { [Op.lt]: new Date(Date.now() - LOCATION_RETENTION_MS) } },
      });
      if (n) this.logger.log(`Yo'l tarixi: ${n} ta eski nuqta o'chirildi`);
    } catch (e) {
      this.logger.error(`Yo'l tarixini tozalab bo'lmadi: ${(e as Error).message}`);
    }
    try {
      await this.couriers.remindCash();
    } catch (e) {
      this.logger.error(`Naqd pul eslatmasi yiqildi: ${(e as Error).message}`);
    }
    try {
      // Ishdan ketgan kuryerning pasport skani 30 kundan keyin o'chadi
      // (topshiriq №26, 1-band; №16 dagi qoida bilan bir xil).
      const n = await this.documents.purgeOldPassports();
      if (n) this.logger.log(`Kuryer pasportlari: ${n} ta skan o'chirildi`);
    } catch (e) {
      this.logger.error(`Pasport skanlarini tozalab bo'lmadi: ${(e as Error).message}`);
    }
  }
}

@Module({
  imports: [
    SequelizeModule.forFeature([...DELIVERY_MODELS, StoreUser]),
    JwtModule.register({}),
    StoreAuthModule,
    OtpModule,
  ],
  controllers: [
    // DIQQAT: `CourierAdminController` (`:id/documents`, `:id/vehicles`)
    // `CouriersController` dagi `:id` dan oldin turishi kerak emas —
    // yo'llar turli chuqurlikda, lekin tartib o'qishni osonlashtiradi.
    CourierDocumentFileController,
    CourierRatesController,
    CourierAdminController,
    CouriersController,
    DeliveriesController,
    CourierAppController,
    DevicesController,
    TrackingController,
  ],
  providers: [
    CouriersService,
    DeliveriesService,
    TrackingService,
    ProofStorageService,
    CourierDocumentsService,
    CourierVehiclesService,
    CourierWorkService,
    R2DocumentsStore,
    CourierGuard,
    DeliveriesJobs,
  ],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
