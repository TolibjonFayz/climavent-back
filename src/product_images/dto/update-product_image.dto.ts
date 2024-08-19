import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateProductImageDto {
  @ApiProperty({ example: 'kdjasjbfs.png', description: 'Mahsulot rasmi' })
  @IsString()
  @IsNotEmpty()
  image_link: string;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;
}
