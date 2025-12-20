import { IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProductModelInfoDto {
  @ApiProperty({ example: 500, description: 'Info of product id' })
  @IsString()
  @IsNotEmpty()
  info: string;

  @ApiProperty({ example: 1, description: 'Product model id' })
  @IsNumber()
  @IsNotEmpty()
  product_model_id: number;
}
