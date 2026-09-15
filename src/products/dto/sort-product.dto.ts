import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class SortProductDto {
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

  @ApiProperty({
    example: true,
    required: false,
    description: "true — faqat FAOL aksiyadagi mahsulotlar (topshiriq №15)",
  })
  @IsOptional()
  @IsBoolean()
  on_sale?: boolean;
}
