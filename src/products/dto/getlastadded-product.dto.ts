import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional } from 'class-validator';

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
}
