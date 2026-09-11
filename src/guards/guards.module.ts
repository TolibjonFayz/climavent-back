import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminGuard } from './admin.guard';
import { ServiceKeyGuard } from './service_key.guard';
import { JwtOrServiceKeyGuard } from './jwt_or_service_key.guard';
import { AdminOrStoreGuard } from './admin_or_store.guard';
import { CustomerOrBackofficeGuard } from './customer_or_backoffice.guard';
import { UserSelfOrBackofficeGuard } from './user_self_or_backoffice.guard';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';

// Global qilib berilgan, chunki JwtOrServiceKeyGuard ko'p modullarda
// ishlatiladi va ServiceKeyGuard hech qayerda provider sifatida
// ro'yxatdan o'tmagan bo'lsa, Nest uni nested dependency sifatida
// hal qila olmaydi.
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [
    AdminGuard,
    ServiceKeyGuard,
    JwtOrServiceKeyGuard,
    StoreAuthGuard,
    AdminOrStoreGuard,
    CustomerOrBackofficeGuard,
    UserSelfOrBackofficeGuard,
  ],
  exports: [
    AdminGuard,
    ServiceKeyGuard,
    JwtOrServiceKeyGuard,
    StoreAuthGuard,
    AdminOrStoreGuard,
    CustomerOrBackofficeGuard,
    UserSelfOrBackofficeGuard,
  ],
})
export class GuardsModule {}
