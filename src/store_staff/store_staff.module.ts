import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { StoreAuthModule } from 'src/store_auth/store_auth.module';
import { StoreRolesController, StoreStaffController } from './store_staff.controller';
import { StoreStaffService } from './store_staff.service';

/** Do'kon xodimlari va rollar (topshiriq №35). */
@Module({
  imports: [StoreAuthModule, JwtModule.register({})],
  controllers: [StoreRolesController, StoreStaffController],
  providers: [StoreStaffService],
})
export class StoreStaffModule {}
