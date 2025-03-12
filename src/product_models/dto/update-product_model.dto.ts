import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateProductModelDto } from './create-product_model.dto';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateProductModelDto extends PartialType(CreateProductModelDto) {
  @ApiProperty({
    example: 'BNB243.1-053-050-01-1.8-04-1',
    description: 'Model of product',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 1200000, description: 'Price of product' })
  @IsString()
  @IsNotEmpty()
  price: string;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;
}
