import { UsersController } from './users.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { MailModule } from 'src/mail/mail.module';
import { UsersService } from './users.service';
import { User } from './model/user.model';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Otp } from 'src/otp/models/otp.model';
import { OtpModule } from 'src/otp/otp.module';

@Module({
  imports: [
    SequelizeModule.forFeature([User, Otp]),
    JwtModule.register({}),
    MailModule,
    OtpModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
