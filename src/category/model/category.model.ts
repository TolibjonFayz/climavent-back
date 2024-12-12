import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
} from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';

interface CategoryAtr {
  name_uz: String;
  name_ru: String;
  name_en: String;
  parent_category_id: Number;
}

@Table({ tableName: 'category' })
export class Category extends Model<Category, CategoryAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ApiProperty({
    example: 'VR conditsioner tizimlari',
    description: 'Name of category in uzbek',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  name_uz: string;

  @ApiProperty({
    example: 'Системы кондиционирования VR',
    description: 'Name of category in russian',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  name_ru: string;

  @ApiProperty({
    example: 'VR air conditioning systems',
    description: 'Name of category in english',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  name_en: string;

  @ForeignKey(() => Category)
  @ApiProperty({ example: 1, description: 'Parent category id' })
  @Column({
    type: DataType.INTEGER,
  })
  category_id: number;
}
