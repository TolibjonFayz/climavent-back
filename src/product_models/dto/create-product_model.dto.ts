import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateProductModelDto {
  @ApiProperty({
    example: 'BNB243.1-053-050-01-1.8-04-1',
    description: 'Model of product',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 1200000,
    description: "Price of product (kiritilmagan bo'lsa yubormang)",
    required: false,
  })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiProperty({
    example: 'ВЦ 4-75-2,5-О-1-0,12/1500',
    description: "Rasmiy SAP kodi (bo'lmasligi mumkin)",
    required: false,
  })
  @IsOptional()
  @IsString()
  sap_name?: string;

  @ApiProperty({
    example: 12,
    description: "Ombordagi qoldiq (kiritilmagan bo'lsa yubormang)",
    required: false,
  })
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;
}
