import { ApiProperty, PartialType } from '@nestjs/swagger';
import { RegisterUserDto } from './register-user.dto';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateUserDto extends PartialType(RegisterUserDto) {
  @ApiProperty({ example: 'Adam', description: 'Name of user' })
  name: string;

  @ApiProperty({ example: 'Adamov', description: 'Surname of user' })
  surname: string;

  @ApiProperty({ example: "Adam o'g'li", description: "Name of user's father" })
  fathername: string;

  @ApiProperty({ example: '04.09.2005', description: 'Birthday of user' })
  birthdate: Date;

  @ApiProperty({ example: 'Man', description: 'Sex of user (man or woman)' })
  sex: string;

  @ApiProperty({
    example: '+998908150513',
    description: 'Phone number of user',
  })
  phone_number: string;

  @ApiProperty({
    example: '+998908150513',
    description: 'Additional phone number of user',
  })
  additional_phone_number: string;

  @ApiProperty({ example: 'user@gmail.com', description: 'Email of user' })
  email: string;

  @ApiProperty({ example: 'myimg.jpg', description: 'Image of user' })
  image_url: string;

  @ApiProperty({ example: 'myimg.jpg', description: 'Image of user' })
  region: string;

  @ApiProperty({ example: 'myimg.jpg', description: 'Image of user' })
  city: string;

  @ApiProperty({ example: 'myimg.jpg', description: 'Image of user' })
  adress: string;
}
