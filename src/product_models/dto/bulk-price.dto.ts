import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class BulkPriceItemDto {
  @ApiProperty({
    example: 'ПВН 500-300-2',
    description: "Model nomi (name yoki sap_name'dan kamida bittasi kerak)",
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    example: 'ВЦ 4-75-2,5-О-1-0,12/1500',
    description: "SAP kodi (name yoki sap_name'dan kamida bittasi kerak)",
    required: false,
  })
  @IsOptional()
  @IsString()
  sap_name?: string;

  @ApiProperty({ example: 4500000, description: 'Narx' })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiProperty({ example: 'UZS', description: 'Valyuta', required: false })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({
    example: '2026-12-31',
    description: "Narx amal qilish muddati (ISO sana)",
    required: false,
  })
  @IsOptional()
  @IsDateString()
  price_valid_until?: string;
}
