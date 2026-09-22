import { UsersController } from './users.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { MailModule } from 'src/mail/mail.module';
import { UsersService } from './users.service';
import { User } from './model/user.model';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Otp } from 'src/otp/models/otp.model';
import { OtpModule } from 'src/otp/otp.module';
import { Like } from 'src/likes/model/like.model';
import { Cart } from 'src/cart/models/cart.model';
import { OffersModule } from 'src/offers/offers.module';
import { UserRefreshToken } from './model/user-refresh-token.model';

@Module({
  imports: [
    // `UserRefreshToken` — mobil sessiya (topshiriq №29, 3-band). Statik
    // ishlatiladi (`user-mobile-session.ts`), lekin `sequelize.sync()` va
    // `autoLoadModels` uni ko'rishi uchun ro'yxatda turishi shart.
    SequelizeModule.forFeature([User, Otp, Like, Cart, UserRefreshToken]),
    JwtModule.register({}),
    MailModule,
    OtpModule,
    OffersModule, // rozilik dalili (№18)
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
