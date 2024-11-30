import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginUserDto {
  @ApiProperty({ example: '+998900000000', description: 'Number of user' })
  @IsString()
  @IsNotEmpty()
  phone_number: string;
}
