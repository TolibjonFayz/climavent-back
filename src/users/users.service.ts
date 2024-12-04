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

  // Login user
  async loginUser(loginuserDto: LoginUserDto, res: Response) {
    //Is user exists?
    let user = await this.UsersRepository.findOne({
      where: { phone_number: loginuserDto.phone_number },
    });
    if (!user) {
      user = await this.UsersRepository.create({
        phone_number: loginuserDto.phone_number,
      });
    }

    const otpinfo = await this.signInWithOtp(loginuserDto.phone_number);

    //Generate new tokens
    const tokens = await this.getTokens(user);
    const hashed_refresh_token = await bcrypt.hash(tokens.refreshToken, 7);
    const updateUser = await this.UsersRepository.update(
      { refresh_token: hashed_refresh_token },
      { where: { id: user.id }, returning: true },
    );

    //Cookie setting
    res.cookie('refresh_token', tokens.refreshToken, {
      maxAge: 15 * 24 * 60 * 60 * 10000,
      httpOnly: true,
    });

    const response = {
      message: 'Verification code sent to user',
      user: updateUser[1][0],
      tokens,
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
    const otp = Number(
      otpGenerator.generate(5, {
        upperCaseAlphabets: false,
        lowerCaseAlphabets: false,
        specialChars: false,
      }),
    );
    await this.otpService.sendOtp(phone_number, otp);

    const now = new Date();
    const expiration_time = AddMinutesToDate(now, 2);
    await this.otpRepo.destroy({
      where: { phone_number: `+${phone_number}` },
    });

    const newOtp = await this.otpRepo.create({
      unique_id: uuidv4(),
      otp: otp,
      expiration_time,
      phone_number: `+${phone_number}`,
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
    const { verification_key, otp, phone_number, userId } = verifyOtpDto;
    const check_number = phone_number;

    const obj: IOtpType = JSON.parse(await decode(verification_key));

    if (obj.phone_number != check_number) {
      throw new BadRequestException('Tasdiqlash kodi bu raqamga yuborilmagan');
    }

    let otpDB = await this.otpRepo.findOne({
      where: { phone_number: obj.phone_number },
    });

    if (!otpDB) {
      throw new BadRequestException('Wrong one time password');
    }
    otpDB = otpDB.dataValues;
    await this.UsersRepository.update(
      { is_active: true },
      { where: { phone_number: phone_number } },
    );

    if (otpDB) {
      if (!otpDB.verified) {
        if (dates.compare(otpDB.expiration_time, new Date())) {
          if (otpDB.otp === otp) {
            const client = await this.UsersRepository.findOne({
              where: {
                phone_number: obj.phone_number,
              },
            });
            if (client) {
              const ress = await this.makeVerifyTrue(otpDB.unique_id);
              const tokens = await this.getTokens(client);
              client.refresh_token = await bcrypt.hash(tokens.refreshToken, 8);
              client.save();
              res.cookie('refresh_token', tokens.refreshToken, {
                maxAge: 15 * 21 * 60 * 60 * 1000,
                httpOnly: true,
              });

              const response = {
                client: client,
                tokens: tokens,
                role: 'client',
                status: 1,
                ress,
              };
              return response;
            } else {
              await this.UsersRepository.update(
                {
                  phone_number: phone_number,
                  name: null,
                },
                { where: { id: userId } },
              );
              const client = await this.UsersRepository.findOne({
                where: { id: userId },
              });
              const tokens = await this.getTokens(client);
              client.refresh_token = await bcrypt.hash(tokens.refreshToken, 8);
              client.save();

              res.cookie('refresh_token', tokens.refreshToken, {
                maxAge: 15 * 21 * 60 * 60 * 1000,
                httpOnly: true,
              });

              const response = {
                client: client,
                tokens: tokens,
                role: 'client',
                status: 0,
              };
              return response;
            }
          } else {
            throw new BadRequestException(`Tasdiqlash kodi xato`);
          }
        } else {
          throw new BadRequestException('Tasdiqlash kodi muddati tugagan');
        }
      } else {
        throw new BadRequestException(
          'Tasdiqlash kodi allaqchon qabul qilingan',
        );
      }
    } else {
      throw new BadRequestException('Bunday OTP mavjud emas');
    }
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
      carts: carts.cartItems,
    };
    return payload;
  }
}
