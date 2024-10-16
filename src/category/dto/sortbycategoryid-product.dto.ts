import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class SortbyCategoryIdProductDto {
  @ApiProperty({
    example: 'ASC',
    description: 'Sort by price value (ASC, DESC)',
  })
  @IsString()
  price: string;

  @ApiProperty({ example: 20, description: 'Limit of products' })
  @IsNumber()
  @IsNotEmpty()
  limit: number;

  @ApiProperty({ example: 1, description: 'Page of products' })
  @IsNumber()
  @IsNotEmpty()
  page: number;

  @ApiProperty({ example: 3, description: 'Product category id' })
  @IsNumber()
  @IsNotEmpty()
  category_id: number;
}
