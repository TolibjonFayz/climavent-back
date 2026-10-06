import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

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

  @ApiProperty({
    example: true,
    required: false,
    description: "true — faqat FAOL aksiyadagi mahsulotlar (topshiriq №15)",
  })
  @IsOptional()
  @IsBoolean()
  on_sale?: boolean;

  @ApiProperty({
    example: 'card',
    required: false,
    description: "`card` — yengil ro'yxat (kartochka maydonlari, `?view=card` bilan bir xil). Standart — to'liq",
  })
  @IsOptional()
  @IsIn(['card', 'full'])
  view?: 'card' | 'full';
}
