import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateProductModelHeaderDto } from './create-product_model_header.dto';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateProductModelHeaderDto extends PartialType(
  CreateProductModelHeaderDto,
) {
  @ApiProperty({ example: "O'lchami uz", description: 'Size of it' })
  @IsString()
  @IsNotEmpty()
  header_name_uz: string;

  @ApiProperty({ example: "O'lchami ru", description: 'Size of it' })
  @IsString()
  @IsNotEmpty()
  header_name_ru: string;

  @ApiProperty({ example: "O'lchami en", description: 'Size of it' })
  @IsString()
  @IsNotEmpty()
  header_name_en: string;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;
}
