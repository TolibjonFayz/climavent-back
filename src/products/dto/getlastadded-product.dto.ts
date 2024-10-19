import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class GetRecentlyAddedProductsDto {
  @ApiProperty({ example: 2, description: 'Page of products' })
  @IsNumber()
  @IsNotEmpty()
  page: number;

  @ApiProperty({ example: 8, description: 'Limit for product section' })
  @IsNumber()
  @IsNotEmpty()
  limit: number;
}
