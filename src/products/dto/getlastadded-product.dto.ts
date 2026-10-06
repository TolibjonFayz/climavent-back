import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional } from 'class-validator';

export class GetRecentlyAddedProductsDto {
  @ApiProperty({
    example: 1,
    description: 'Page of products',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @ApiProperty({
    example: 20,
    description: 'Limit for product section',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  limit?: number = 20;

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
