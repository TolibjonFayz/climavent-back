import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @ApiProperty({
    example: 'VR conditsioner tizimlari',
    description: 'Name of category',
  })
  @IsString()
  @IsNotEmpty()
  name_uz: string;

  @ApiProperty({
    example: 'VR air conditioning systems',
    description: 'Name of category in english',
  })
  @IsString()
  @IsNotEmpty()
  name_en: string;

  @ApiProperty({
    example: 'Системы кондиционирования VR',
    description: 'Name of category in russian',
  })
  @IsString()
  @IsNotEmpty()
  name_ru: string;

  @ApiProperty({ example: 1, description: 'Product id' })
  category_id: number;
}
