import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
} from 'sequelize-typescript';
import { ApiProperty } from '@nestjs/swagger';

interface CategoryAtr {
  name: String;
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
    description: 'Name of category',
  })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  name: string;

  @ForeignKey(() => Category)
  @ApiProperty({ example: 1, description: 'Parent category id' })
  @Column({
    type: DataType.INTEGER,
  })
  category_id: number;
}
