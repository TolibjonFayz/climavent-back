import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateProductModelInfoDto } from './create-product_model_info.dto';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateProductModelInfoDto extends PartialType(
  CreateProductModelInfoDto,
) {
  @ApiProperty({ example: 500, description: 'Info of product id' })
  @IsString()
  @IsNotEmpty()
  info: string;

  @ApiProperty({ example: 1, description: 'Product model id' })
  @IsNumber()
  @IsNotEmpty()
  product_model_id: number;

  @ApiProperty({ example: 1, description: 'Product model header id' })
  @IsNumber()
  @IsNotEmpty()
  product_model_header_id: number;
}
