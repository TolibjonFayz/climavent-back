import {
  Controller,
  Delete,
  Patch,
  Param,
  Post,
  Body,
  Get,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RegisterUserDto } from './dto/register-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto.';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { UsersService } from './users.service';
import { User } from './model/user.model';
import { Response } from 'express';
import { SignoutDto } from './dto/signout.dto';

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

  //Login user
  @ApiOperation({ summary: 'Login user' })
  @Post('login')
  async login(
    @Body() loginUserDto: LoginUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.usersService.loginUser(loginUserDto, res);
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

  //Get all users
  @ApiOperation({ summary: 'Get all users' })
  @Get('all')
  async getAllUsers(): Promise<User[] | any> {
    return this.usersService.getAllUsers();
  }

  //Get user by id
  @ApiOperation({ summary: 'Get user by id' })
  @Get('one/:id')
  async getUserById(@Param('id') id: number): Promise<User> {
    return this.usersService.getUserById(id);
  }

  //Get user badges by id
  @ApiOperation({ summary: 'Get user badges by id' })
  @Get('badges/:id')
  async getUserBadgeById(@Param('id') id: number) {
    return this.usersService.getUserBadgeNumbers(id);
  }

  //Verify OTP
  @ApiOperation({ summary: 'Verify OTP' })
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  @Post('verify-otp')
  verifyOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.usersService.verifyOtpClient(verifyOtpDto, res);
  }

  //Update user by id
  @ApiOperation({ summary: 'Update user by id' })
  @Patch('update/:id')
  async updateUser(
    @Param('id') id: number,
    @Body() updateUserdto: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.updateUser(+id, updateUserdto);
  }

  //Delete user by id
  @ApiOperation({ summary: 'Delete user by id' })
  @Delete('delete/:id')
  async deleteUser(@Param('id') id: number): Promise<string> {
    return this.usersService.deleteUser(id);
  }
}
