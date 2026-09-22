import {
  Controller,
  Delete,
  HttpCode,
  Patch,
  Param,
  ParseIntPipe,
  Post,
  Body,
  Get,
  Res,
  UseGuards,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { RegisterUserDto } from './dto/register-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto.';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { UsersService } from './users.service';
import { User } from './model/user.model';
import { Request, Response } from 'express';
import { SignoutDto } from './dto/signout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UserSelfGuard } from 'src/guards/user_self.guard';
import { UserSelfOrBackofficeGuard } from 'src/guards/user_self_or_backoffice.guard';
import { JwtOrServiceKeyGuard } from 'src/guards/jwt_or_service_key.guard';
import { parsePositiveIntParam } from 'src/common/helpers/pagination';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Registering new user
  @ApiResponse({ status: 201, description: 'User successfully signedup' })
  @ApiResponse({ status: 400, description: 'Something went wrong' })
  @ApiOperation({ summary: 'Register user' })
  @Post('register')
  async registerNewUser(
    @Body() registerUserDto: RegisterUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.usersService.registerNewUser(registerUserDto, res);
  }

  //Activate user
  @ApiOperation({ summary: 'Activate user' })
  @Get('activate/:link')
  activate(@Param('link') link: string) {
    return this.usersService.activateUser(link);
  }

  //Login user — OTP yuboradi (token bermaydi). SMS pullik, shuning uchun
  //IP boshiga qattiqroq cheklov: soatiga 10 ta so'rov.
  @ApiOperation({ summary: 'Login user (send OTP)' })
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  @Post('login')
  async login(@Body() loginUserDto: LoginUserDto) {
    return this.usersService.loginUser(loginUserDto);
  }

  /**
   * MOBIL SESSIYANI YANGILASH (topshiriq №29, 3-band).
   *
   * Muddat: access — `MOBILE_ACCESS_TOKEN_TIME_USER` (standart 15 daqiqa),
   * refresh — 90 kun va SIRPANUVCHI (har yangilashda qaytadan 90 kun).
   * Refresh HAR chaqiruvda almashadi; eski token qayta kelsa butun zanjir
   * bekor qilinadi (o'g'irlik belgisi). Tarmoq uzilgan holat uchun 30
   * soniyalik imtiyoz oynasi bor — o'sha juftlik qaytariladi.
   */
  @ApiOperation({ summary: 'Refresh mobile session (xaridor)' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        accessToken: 'eyJhbGciOi...',
        refreshToken: 'q7k2...',
        refresh_expires_at: '2026-12-21T10:00:00.000Z',
        expires_in: '15m',
      },
    },
  })
  @ApiResponse({ status: 401, description: "Noto'g'ri, muddati o'tgan yoki qayta ishlatilgan" })
  // Token o'zi 48 baytlik tasodifiy qiymat; cheklov faqat suiiste'molga qarshi.
  @Throttle({ default: { limit: 60, ttl: 60 * 1000 } })
  // 200 (201 emas) — topshiriqdagi shartnoma va `store-auth/refresh` bilan bir xil
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.usersService.refreshMobileSession(dto.refresh_token, {
      ip: req.ip,
      userAgent: String(req.headers['user-agent'] || ''),
    });
  }

  //Sign out user
  @ApiOperation({ summary: 'Sign out user' })
  @Post('signout')
  async signOutUser(
    @Body() signoutDto: SignoutDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.usersService.signOutUser(signoutDto, res);
  }

  // Get all users — sayt admini YOKI servis kaliti (topshiriq №13, 1-band).
  // Do'kon tokeni ATAYLAB qabul qilinmaydi: bu yerda BARCHA mijozlarning
  // shaxsiy ma'lumoti bor.
  //
  // Javob tanasi — massiv (oldingidek). Jami son `X-Total-Count`
  // sarlavhasida: sahifalash uchun alohida so'rov kerak emas.
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiOperation({ summary: 'Get all users (admin yoki servis kaliti)' })
  @ApiQuery({ name: 'page', required: false, example: '1' })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: '50',
    description: "Standart 50, eng ko'pi 500",
  })
  @ApiQuery({
    name: 'search',
    required: false,
    example: 'Tolibjon',
    description: "Ism, familiya, telefon yoki e-pochta bo'yicha",
  })
  @ApiResponse({
    status: 200,
    description: "Mijozlar massivi. Jami son — `X-Total-Count` sarlavhasida",
  })
  @Get('all')
  @UseGuards(JwtOrServiceKeyGuard)
  async getAllUsers(
    @Res({ passthrough: true }) res: Response,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ): Promise<User[]> {
    const { rows, total } = await this.usersService.getAllUsers({
      page: parsePositiveIntParam(page, 'page'),
      limit: parsePositiveIntParam(limit, 'limit'),
      search,
    });
    res.setHeader('X-Total-Count', String(total));
    return rows;
  }

  //Get user by id
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user by id' })
    // Mijozning o'zi YOKI orqa ofis (servis kaliti, sayt admini) —
  // adminkaning mijoz sahifasi uchun (topshiriq №13, 1-band).
  @ApiSecurity('service-key')
  @UseGuards(UserSelfOrBackofficeGuard)
  @Get('one/:id')
  async getUserById(@Param('id', ParseIntPipe) id: number): Promise<User> {
    return this.usersService.getUserById(id);
  }

  //Get user badges by id — faqat o'sha foydalanuvchining o'zi
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user badges by id (self)' })
    // Mijozning o'zi YOKI orqa ofis (servis kaliti, sayt admini) —
  // adminkaning mijoz sahifasi uchun (topshiriq №13, 1-band).
  @ApiSecurity('service-key')
  @UseGuards(UserSelfOrBackofficeGuard)
  @Get('badges/:id')
  async getUserBadgeById(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getUserBadgeNumbers(id);
  }

  //Verify OTP
  @ApiOperation({ summary: 'Verify OTP' })
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  @Post('verify-otp')
  verifyOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    return this.usersService.verifyOtpClient(verifyOtpDto, res, {
      ip: req.ip,
      userAgent: String(req.headers['user-agent'] || ''),
    });
  }

  //Update user by id
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user by id' })
  @UseGuards(UserSelfGuard)
  @Patch('update/:id')
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserdto: UpdateUserDto,
    // Javob — yangilangan qatorning maydonlari (`lang` bilan), model
    // nusxasi emas; shuning uchun `User` tipi qo'yilmaydi.
  ) {
    return this.usersService.updateUser(+id, updateUserdto);
  }

  //Delete user by id
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete user by id' })
  @UseGuards(UserSelfGuard)
  @Delete('delete/:id')
  async deleteUser(@Param('id', ParseIntPipe) id: number): Promise<string> {
    return this.usersService.deleteUser(id);
  }
}
