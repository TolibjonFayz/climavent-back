import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminGuard } from './admin.guard';
import { ServiceKeyGuard } from './service_key.guard';
import { JwtOrServiceKeyGuard } from './jwt_or_service_key.guard';
import { AdminOrStoreGuard } from './admin_or_store.guard';
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
  ],
  exports: [
    AdminGuard,
    ServiceKeyGuard,
    JwtOrServiceKeyGuard,
    StoreAuthGuard,
    AdminOrStoreGuard,
  ],
})
export class GuardsModule {}
