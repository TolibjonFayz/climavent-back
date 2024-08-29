import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RegisterUserDto {
  @ApiProperty({ example: 'Adam', description: 'Name of user' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Adamov', description: 'Surname of user' })
  @IsString()
  surname: string;

  @ApiProperty({
    example: '+998908150513',
    description: 'Phone number of user',
  })
  @IsString()
  @IsNotEmpty()
  phone_number: string;

  @ApiProperty({ example: 'user@gmail.com', description: 'Email of user' })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'qwerty', description: 'Password of user' })
  @IsNotEmpty()
  @IsString()
  password: string;

  @ApiProperty({ example: 'myimg.jpg', description: 'Image of user' })
  image_url: string;
}
