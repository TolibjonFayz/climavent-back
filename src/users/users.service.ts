import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { dates, decode, encode } from '../common/helpers/crypto';
import { AddMinutesToDate } from '../common/helpers/addMinutes';
import { IOtpType } from '../common/types/decode-otp.type';
import { RegisterUserDto } from './dto/register-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto.';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { MailService } from '../mail/mail.service';
import { OtpService } from 'src/otp/otp.service';
import { InjectModel } from '@nestjs/sequelize';
import { Otp } from 'src/otp/models/otp.model';
import * as otpGenerator from 'otp-generator';
import { User } from './model/user.model';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { SignoutDto } from './dto/signout.dto';
import { Like } from 'src/likes/model/like.model';
import { Cart } from 'src/cart/models/cart.model';
import { Op } from 'sequelize';

// Refresh token cookie muddati: 75 kun — REFRESH_TOKEN_TIME_USER (.env) bilan
// mos kelishi kerak, aks holda cookie JWT haqiqiy amal qilish muddatidan
// oldin o'chib, mijoz muddatidan oldin qayta SMS oladi.
const REFRESH_TOKEN_COOKIE_MAX_AGE = 75 * 24 * 60 * 60 * 1000;

// OTP cheklovlari — SMS pullik, shuning uchun suiiste'moldan himoya kerak
const OTP_RESEND_COOLDOWN_MS = 5 * 60 * 1000; // bitta raqamga 5 daqiqada 1 marta
const OTP_DAILY_LIMIT = 5; // bitta raqamga sutkasiga necha marta SMS
const OTP_MAX_ATTEMPTS = 3; // bitta kodga necha marta noto'g'ri urinish mumkin
// Tasdiqlanmagan (is_active=false) "yaratib tashlab ketilgan" foydalanuvchilarni
// shuncha vaqtdan keyin eskirgan deb hisoblab, keyingi login'da tozalaymiz
const STALE_UNVERIFIED_USER_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User) private UsersRepository: typeof User,
    @InjectModel(Otp) private readonly otpRepo: typeof Otp,
    @InjectModel(Like) private readonly likeRepo: typeof Like,
    @InjectModel(Cart) private readonly cartRepo: typeof Cart,
    private readonly jwtservice: JwtService,
    private readonly mailService: MailService,
    private readonly otpService: OtpService,
  ) {}

  // Registering new user
  async registerNewUser(registerUserDto: RegisterUserDto, res: Response) {
    // Is user exists
    // const isUserExists = await this.UsersRepository.findOne({
    //   where: { email: registerUserDto.email },
    // });
    // if (isUserExists) throw new BadRequestException('User already exists');
    // //Password is hashing
    // const hashed_password = await bcrypt.hash(registerUserDto.name, 8);
    // //User is registering
    // const newuser = await this.UsersRepository.create({
    //   ...registerUserDto,
    //   password: hashed_password,
    // });
    // //Refresh and access tokens are generating
    // const tokens = await this.getTokens(newuser);
    // //Update user
    // const hashed_refresh_token = await bcrypt.hash(tokens.refreshToken, 7);
    // const uniqueKey: string = uuidv4();
    // const updateUser = await this.UsersRepository.update(
    //   {
    //     refresh_token: hashed_refresh_token,
    //     unique_id: uniqueKey,
    //   },
    //   {
    //     where: { id: newuser.id },
    //     returning: true,
    //   },
    // );
    // //Cookie setting
    // res.cookie('refresh_token', tokens.refreshToken, {
    //   maxAge: 15 * 24 * 60 * 60 * 1000,
    // });
    // //Sending data to front
    // const response = {
    //   message: 'User signed up successfully',
    //   user: updateUser[1][0],
    //   tokens,
    // };
    // //sending email to admin
    // try {
    //   await this.mailService.sendAdminConfrmation(updateUser[1][0]);
    // } catch (error) {
    //   console.log(error);
    // }
    // //Send response
    // return response;
  }

  //Activate user
  async activateUser(link: string) {
    if (!link) throw new BadRequestException('Activation link not found');

    const updateUser = await this.UsersRepository.update(
      { is_active: true },
      { where: { unique_id: link, is_active: false }, returning: true },
    );

    if (!updateUser[1][0]) {
      throw new BadRequestException(
        'Sizning emailingiz allaqachon aktivlashtirilgan, bemalol foydalanishingiz mumkin.',
      );
    }

    const response = {
      message: 'User successfully updated',
      worker: updateUser,
    };

    return response;
  }

  // Login user — faqat OTP yuboradi. Token OTP tasdiqlangandan keyin beriladi.
  async loginUser(loginuserDto: LoginUserDto) {
    //Is user exists?
    let user = await this.UsersRepository.findOne({
      where: { phone_number: loginuserDto.phone_number },
    });
    if (!user) {
      // Eskirgan, hech qachon tasdiqlanmagan (login qilib, OTP kiritilmagan)
      // yozuvlarni tozalab turamiz — aks holda baza soxta raqamlar bilan to'ladi.
      await this.UsersRepository.destroy({
        where: {
          is_active: false,
          createdAt: {
            [Op.lt]: new Date(Date.now() - STALE_UNVERIFIED_USER_MS),
          },
        },
      });

      user = await this.UsersRepository.create({
        phone_number: loginuserDto.phone_number,
      });
    }

    const otpinfo = await this.signInWithOtp(loginuserDto.phone_number);

    // MUHIM: token bu yerda BERILMAYDI — aks holda OTP tekshiruvi ma'nosiz bo'ladi.
    const response = {
      message: 'Verification code sent to user',
      user: { id: user.id, phone_number: user.phone_number },
      otpinfo,
    };
    return response;
  }

  //Sign out user
  async signOutUser(signoutDto: SignoutDto, res: Response) {
    const userData = await this.jwtservice.verify(signoutDto.refresh_token, {
      secret: process.env.REFRESH_TOKEN_KEY,
    });

    //Is users exists?
    if (!userData) throw new ForbiddenException('User not found');
    const updateUser = await this.UsersRepository.update(
      { refresh_token: null },
      { where: { id: userData.id }, returning: true },
    );
    if (!updateUser[0]) throw new ForbiddenException('User update failed');

    //Clearing cookie
    res.clearCookie('refresh_token');
    const response = {
      message: 'User signed out successfully',
      admin: updateUser[1][0],
    };
    return response;
  }

  //Get all users
  async getAllUsers() {
    const users = await this.UsersRepository.findAll({
      include: { all: true },
    });
    return users;
  }

  //Get user by id
  async getUserById(id: number) {
    const user = await this.UsersRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  //Update user by id
  async updateUser(id: number, updateUserDto: UpdateUserDto) {
    const updating = await this.UsersRepository.update(updateUserDto, {
      where: { id },
      returning: true,
    });
    return updating[1][0].dataValues;
  }

  //Delete user by id
  async deleteUser(id: number) {
    const deleting = await this.UsersRepository.destroy({ where: { id: id } });
    if (deleting) return 'User deleted successfully';
    else throw new NotFoundException('User not found or something is wrong');
  }

  //Token generation
  async getTokens(user: User) {
    const JwtPayload = {
      id: user.id,
      is_active: user.is_active,
      is_admin: user.is_admin,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtservice.signAsync(JwtPayload, {
        secret: process.env.ACCESS_TOKEN_KEY_USER,
        expiresIn: process.env.ACCESS_TOKEN_TIME_USER,
      }),
      this.jwtservice.signAsync(JwtPayload, {
        secret: process.env.REFRESH_TOKEN_KEY_USER,
        expiresIn: process.env.REFRESH_TOKEN_TIME_USER,
      }),
    ]);
    return {
      accessToken: accessToken,
      refreshToken: refreshToken,
    };
  }

  async signInWithOtp(phone_number: string) {
    const client = Number(
      phone_number
        .split('')
        .filter((num) => !isNaN(+num))
        .join(''),
    );

    await this.otpService.auth();

    const decoded = await this.newOtp(client);
    if (!decoded) throw new BadRequestException('An error ocured...');
    return decoded;
  }

  async newOtp(phone_number: number) {
    const fullPhone = `+${phone_number}`;
    const now = new Date();

    // Sutkalik SMS limiti (eski qatorlar endi o'chirilmaydi, shuning
    // uchun shu raqamga oxirgi 24 soatda nechta kod yuborilganini sanay olamiz)
    const sentToday = await this.otpRepo.count({
      where: {
        phone_number: fullPhone,
        createdAt: { [Op.gte]: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });
    if (sentToday >= OTP_DAILY_LIMIT) {
      throw new BadRequestException(
        "Bu raqamga sutkalik SMS limiti tugadi, ertaga qayta urinib ko'ring",
      );
    }

    // Tez-tez qayta so'rashni cheklash
    const lastOtp = await this.otpRepo.findOne({
      where: { phone_number: fullPhone },
      order: [['createdAt', 'DESC']],
    });
    if (
      lastOtp &&
      now.getTime() - lastOtp.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS
    ) {
      throw new BadRequestException(
        "Kod hozirgina yuborildi, biroz kutib qayta urinib ko'ring"
      );
    }

    // MUHIM: Number() ishlatilmaydi — aks holda "01234" kabi 0 bilan boshlangan
    // kodlar "1234" ga aylanib, tasdiqlash mumkin bo'lmay qoladi.
    const otp = otpGenerator.generate(5, {
      digits: true,
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });
    await this.otpService.sendOtp(phone_number, otp);

    const expiration_time = AddMinutesToDate(now, 5);
    // Eski qatorlar ATAYLAB o'chirilmaydi — sutkalik limitni sanash uchun kerak.
    // Tasdiqlash endi aniq shu urinishning otp_id'si bo'yicha qidiriladi
    // (verifyOtpClient), shuning uchun eski qatorlar chalkashlik keltirmaydi.
    const newOtp = await this.otpRepo.create({
      unique_id: uuidv4(),
      otp: otp,
      expiration_time,
      phone_number: fullPhone,
    });

    const details = {
      timestamp: now,
      phone_number: newOtp.phone_number,
      success: true,
      message: 'OTP sent to client',
      otp_id: newOtp.id,
    };

    const encoded = await encode(JSON.stringify(details));
    return { status: 'Sent', details: encoded };
  }

  async verifyOtpClient(verifyOtpDto: VerifyOtpDto, res: Response) {
    const { verification_key, otp, phone_number } = verifyOtpDto;

    let obj: IOtpType;
    try {
      obj = JSON.parse(await decode(verification_key));
    } catch {
      throw new BadRequestException('Tasdiqlash kaliti yaroqsiz');
    }

    if (obj.phone_number != phone_number) {
      throw new BadRequestException('Tasdiqlash kodi bu raqamga yuborilmagan');
    }

    // Aniq shu urinishning OTP qatori — endi eski qatorlar o'chirilmagani
    // uchun faqat phone_number bo'yicha qidirish noaniq bo'lardi.
    const otpRow = await this.otpRepo.findOne({
      where: { id: obj.otp_id, phone_number: obj.phone_number },
    });
    if (!otpRow) {
      throw new BadRequestException('Bunday OTP mavjud emas');
    }
    const otpDB = otpRow.dataValues;

    // Tekshiruvlar — kod to'g'ri bo'lmaguncha hech narsa o'zgartirmaymiz
    if (otpDB.verified) {
      throw new BadRequestException('Tasdiqlash kodi allaqachon qabul qilingan');
    }
    if (!dates.compare(otpDB.expiration_time, new Date())) {
      throw new BadRequestException('Tasdiqlash kodi muddati tugagan');
    }
    if (otpDB.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException(
        "Noto'g'ri urinishlar soni tugadi, yangi kod so'rang",
      );
    }
    // OTP string sifatida saqlanadi — string bilan solishtiramiz (0 bilan boshlangan kodlar uchun)
    if (String(otpDB.otp) !== String(otp)) {
      await this.otpRepo.increment('attempts', { where: { id: otpDB.id } });
      throw new BadRequestException('Tasdiqlash kodi xato');
    }

    // Kod to'g'ri — endi OTP ni ishlatilgan deb belgilaymiz, userni aktivlashtiramiz va token beramiz
    await this.makeVerifyTrue(otpDB.unique_id);
    await this.UsersRepository.update(
      { is_active: true },
      { where: { phone_number } },
    );

    const client = await this.UsersRepository.findOne({
      where: { phone_number },
    });
    if (!client) {
      throw new BadRequestException('Foydalanuvchi topilmadi');
    }

    const tokens = await this.getTokens(client);
    client.refresh_token = await bcrypt.hash(tokens.refreshToken, 8);
    await client.save();

    res.cookie('refresh_token', tokens.refreshToken, {
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
      httpOnly: true,
    });

    return { client, tokens, status: 1 };
  }

  async makeVerifyTrue(otp_id: string) {
    const verified = await this.otpRepo.update(
      { verified: true },
      {
        where: {
          unique_id: otp_id,
        },
      },
    );
    if (verified) return true;
    throw new BadRequestException('Wrong one time password ...');
  }

  async getUserBadgeNumbers(id: number) {
    const likes = await this.likeRepo.count({ where: { user_id: id } });
    const carts = await this.cartRepo.findOne({
      where: { user_id: id },
      include: { all: true },
    });
    const payload = {
      likes,
      carts: carts?.cartItems,
    };
    return payload;
  }

  async refreshToken(user_id: number, refreshToken: string, res: Response) {
    const decodedToken = this.jwtservice.decode(refreshToken);
    if (user_id != decodedToken['id']) {
      throw new BadRequestException('Worker not found');
    }
    const worker = await this.UsersRepository.findOne({
      where: { id: user_id },
    });
    if (!worker || !worker.refresh_token) {
      throw new BadRequestException('Worker not found');
    }
    const tokenMatch = await bcrypt.compare(refreshToken, worker.refresh_token);
    if (!tokenMatch) throw new ForbiddenException('Forbidden');

    const token = await this.getTokens(worker);
    const hashed_refresh_token = await bcrypt.hash(token.refreshToken, 7);
    const updateWorker = await this.UsersRepository.update(
      { refresh_token: hashed_refresh_token },
      { where: { id: worker.id }, returning: true },
    );
    res.cookie('refresh_token', token.refreshToken, {
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
      httpOnly: true,
    });
    const response = {
      message: 'Worker refreshed',
      worker: updateWorker[1][0],
      token,
    };
    return response;
  }
}
