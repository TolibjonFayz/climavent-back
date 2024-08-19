import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateProductImageDto {
  @ApiProperty({ example: 'kdjasjbfs.png', description: 'Image of product' })
  @IsString()
  @IsNotEmpty()
  image_link: string;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;
}
