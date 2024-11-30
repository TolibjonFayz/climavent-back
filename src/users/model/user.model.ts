import { Model, Column, DataType, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';

interface UserAtr {
  name: String;
  surname: String;
  fathername: String;
  birthdate: Date;
  sex: String;
  phone_number: String;
  additional_phone_number: String;
  email: String;
  image_url: String;
  region: String;
  city: String;
  adress: String;
  is_active: Boolean;
  unique_id: String;
}

@Table({ tableName: 'users' })
export class User extends Model<User, UserAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ApiProperty({ example: 'Adam', description: 'Name of user' })
  @Column({
    type: DataType.STRING,
  })
  name: string;

  @ApiProperty({ example: 'Adamov', description: 'Surname of user' })
  @Column({
    type: DataType.STRING,
  })
  surname: string;

  @ApiProperty({ example: "Adam o'g'li", description: "Name of user's father" })
  @Column({
    type: DataType.STRING,
  })
  fathername: string;

  @ApiProperty({ example: '04.09.2005', description: 'Birthday of user' })
  @Column({
    type: DataType.DATE,
  })
  birthdate: Date;

  @ApiProperty({ example: 'Man', description: 'Sex of user (man or woman)' })
  @Column({
    type: DataType.STRING,
  })
  sex: string;

  @ApiProperty({
    example: '+998908150513',
    description: 'Phone number of user',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  phone_number: string;

  @ApiProperty({
    example: '+998908150513',
    description: 'Additional phone number of user',
  })
  @Column({})
  additional_phone_number: string;

  @ApiProperty({ example: 'user@gmail.com', description: 'Email of user' })
  @Column({
    type: DataType.STRING,
  })
  email: string;

  @ApiProperty({ example: 'myimg.jpg', description: 'Image of user' })
  @Column({
    type: DataType.STRING,
  })
  image_url: string;

  @ApiProperty({ example: 'Tashkent city', description: 'Region of user' })
  @Column({
    type: DataType.STRING,
  })
  region: string;

  @ApiProperty({ example: 'Tashkent', description: 'City of user' })
  @Column({
    type: DataType.STRING,
  })
  city: string;

  @ApiProperty({
    example: 'Chilonzor tumani 19-kvartal 16-dom 86-honodon',
    description: 'Adress of user',
  })
  @Column({
    type: DataType.STRING,
  })
  adress: string;

  @Column({
    type: DataType.STRING,
  })
  refresh_token: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  is_active: boolean;

  @ApiProperty({
    example: 'sdlak',
    description: 'Adminni activ qilish uchun ishlatiladigan id',
  })
  @Column({
    type: DataType.STRING,
  })
  unique_id: string;
}
