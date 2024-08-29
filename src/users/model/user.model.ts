import { Model, Column, DataType, Table } from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';

interface UserAtr {
  name: String;
  surname: String;
  phone_number: String;
  email: String;
  password: String;
  image_url: String;
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
    allowNull: false,
  })
  name: string;

  @ApiProperty({ example: 'Adamov', description: 'Surname of user' })
  @Column({
    type: DataType.STRING,
  })
  surname: string;

  @ApiProperty({
    example: '+998908150513',
    description: 'Phone number of user',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  phone_number: string;

  @ApiProperty({ example: 'user@gmail.com', description: 'Email of user' })
  @Column({
    type: DataType.STRING,
  })
  email: string;

  @ApiProperty({ example: 'qwerty', description: 'Password of user' })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  password: string;

  @ApiProperty({ example: 'myimg.jpg', description: 'Image of user' })
  @Column({
    type: DataType.STRING,
  })
  image_url: string;

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
