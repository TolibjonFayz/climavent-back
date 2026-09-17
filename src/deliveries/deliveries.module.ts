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
import { CourierGuard } from './courier.guard';
import { LOCATION_RETENTION_MS } from './constants';

const HOUR = 60 * 60 * 1000;

/**
 * Fon ishlari (topshiriq №22):
 *   - yo'l tarixi 30 kundan keyin o'chiriladi (6-band);
 *   - kuryerda 24 soatdan ortiq topshirilmagan naqd — adminlarga push (9-band).
 */
@Injectable()
export class DeliveriesJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DeliveriesJobs.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly couriers: CouriersService) {}

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
  }
}

@Module({
  imports: [
    SequelizeModule.forFeature([...DELIVERY_MODELS, StoreUser]),
    JwtModule.register({}),
    StoreAuthModule,
    OtpModule,
  ],
  controllers: [CouriersController, DeliveriesController, CourierAppController, DevicesController],
  providers: [CouriersService, DeliveriesService, ProofStorageService, R2DocumentsStore, CourierGuard, DeliveriesJobs],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
