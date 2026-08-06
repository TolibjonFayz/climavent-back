import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class BulkPriceItemDto {
  @ApiProperty({ example: 'ПВН 500-300-2', description: 'Model nomi' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 1930000, description: 'Narx' })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiProperty({ example: 'UZS', description: 'Valyuta', required: false })
  @IsOptional()
  @IsString()
  currency?: string;
}
