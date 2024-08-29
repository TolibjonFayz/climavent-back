import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginUserDto } from './dto/login-user.dto.';
import { MailService } from '../mail/mail.service';
import { InjectModel } from '@nestjs/sequelize';
import { User } from './model/user.model';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User) private UsersRepository: typeof User,
    private readonly jwtservice: JwtService,
    private readonly mailService: MailService,
  ) {}

  // Registering new user
  async registerNewUser(registerUserDto: RegisterUserDto, res: Response) {
    // Is user exists
    const isUserExists = await this.UsersRepository.findOne({
      where: { email: registerUserDto.email },
    });
    if (isUserExists) throw new BadRequestException('User already exists');

    //Password is hashing
    const hashed_password = await bcrypt.hash(registerUserDto.password, 8);

    //User is registering
    const newuser = await this.UsersRepository.create({
      ...registerUserDto,
      password: hashed_password,
    });

    //Refresh and access tokens are generating
    const tokens = await this.getTokens(newuser);

    //Update user
    const hashed_refresh_token = await bcrypt.hash(tokens.refreshToken, 7);
    const uniqueKey: string = uuidv4();
    const updateUser = await this.UsersRepository.update(
      {
        refresh_token: hashed_refresh_token,
        unique_id: uniqueKey,
      },
      {
        where: { id: newuser.id },
        returning: true,
      },
    );

    //Cookie setting
    res.cookie('refresh_token', tokens.refreshToken, {
      maxAge: 15 * 24 * 60 * 60 * 1000,
    });

    //Sending data to front
    const response = {
      message: 'User signed up successfully',
      user: updateUser[1][0],
      tokens,
    };

    //sending email to admin
    try {
      await this.mailService.sendAdminConfrmation(updateUser[1][0]);
    } catch (error) {
      console.log(error);
    }

    //Send response
    return response;
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
    const user = await this.UsersRepository.findOne({
      where: { email: loginuserDto.email },
    });
    if (!user) throw new UnauthorizedException('User has not registered');

    //Checking passwords
    const isMatches = await bcrypt.compare(
      loginuserDto.password,
      user.password,
    );
    if (!isMatches) throw new UnauthorizedException('Password is wrong!');

    //Generate new tokens
    const tokens = await this.getTokens(user);

    //Update user
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
    3;
    const response = {
      message: 'User signed in successfully',
      user: updateUser[1][0],
      tokens,
    };
    return response;
  }

  //Sign out user
  async signOutUser(refresh_token: string, res: Response) {
    const userData = await this.jwtservice.verify(refresh_token, {
      secret: process.env.REFRESH_TOKEN_KEY,
    });

    //Is users exists?
    if (!userData) throw new ForbiddenException('User not found');
    const updateAdmin = await this.UsersRepository.update(
      { refresh_token: null },
      { where: { id: userData.id }, returning: true },
    );

    //Clearing cookie
    res.clearCookie('refresh_token');
    const response = {
      message: 'User signed out successfully',
      admin: updateAdmin[1][0],
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
    const user = await this.UsersRepository.findByPk(id);
    if (!user) throw new NotFoundException('User not found');
  }

  //Update user by id
  async updateUser(id: number, updateUserDto: UpdateUserDto) {
    //Password is hashing
    const hashed_password = await bcrypt.hash(updateUserDto.password, 8);

    const updating = await this.UsersRepository.update(
      { ...updateUserDto, password: hashed_password },
      {
        where: { id },
        returning: true,
      },
    );
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
}
