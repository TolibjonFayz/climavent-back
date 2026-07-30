import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminGuard } from './admin.guard';
import { ServiceKeyGuard } from './service_key.guard';
import { JwtOrServiceKeyGuard } from './jwt_or_service_key.guard';

// Global qilib berilgan, chunki JwtOrServiceKeyGuard ko'p modullarda
// ishlatiladi va ServiceKeyGuard hech qayerda provider sifatida
// ro'yxatdan o'tmagan bo'lsa, Nest uni nested dependency sifatida
// hal qila olmaydi.
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [AdminGuard, ServiceKeyGuard, JwtOrServiceKeyGuard],
  exports: [AdminGuard, ServiceKeyGuard, JwtOrServiceKeyGuard],
})
export class GuardsModule {}
