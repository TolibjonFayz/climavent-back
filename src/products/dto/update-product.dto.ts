import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiProperty({
    example: 'Size info',
    description: 'Product sizes',
    required: false,
  })
  @IsOptional()
  @IsString()
  sizes?: string;

  @ApiProperty({
    example: 'Size info as Json',
    description: 'Product sizes as Json',
    required: false,
  })
  @IsOptional()
  @IsString()
  sizesJson?: string;

  @ApiProperty({
    example: 'Description info',
    description: 'Product description',
    required: false,
  })
  @IsOptional()
  @IsString()
  opisaniya?: string;

  @ApiProperty({
    example: 'Description info as Json',
    description: 'Product description as Json',
    required: false,
  })
  @IsOptional()
  @IsString()
  opisaniyaJson?: string;

  @ApiProperty({
    example: 'Purpose info',
    description: 'Product purpose/usage',
    required: false,
  })
  @IsOptional()
  @IsString()
  naznacheniya?: string;

  @ApiProperty({
    example: 'Purpose info as Json',
    description: 'Product purpose/usage as Json',
    required: false,
  })
  @IsOptional()
  @IsString()
  naznacheniyaJson?: string;

  @ApiProperty({
    example: 'Purpose info',
    description: 'Product marking/labeling',
    required: false,
  })
  @IsOptional()
  @IsString()
  markirovka?: string;

  @ApiProperty({
    example: 'Product marking/labeling as Json',
    description: 'Product marking/labeling as Json',
    required: false,
  })
  @IsOptional()
  @IsString()
  markirovkaJson?: string;
}
