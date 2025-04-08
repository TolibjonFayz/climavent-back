import { IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSelectedToCheckoutDto {
  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;

  @ApiProperty({ example: 1, description: 'User id' })
  @IsNumber()
  @IsNotEmpty()
  user_id: number;

  @ApiProperty({ example: 'jajsdbnifuab', description: 'Product model' })
  @IsString()
  @IsNotEmpty()
  product_model: string;

  @ApiProperty({ example: 23, description: 'Product quantity' })
  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @ApiProperty({ example: 25000, description: 'Product price' })
  @IsNumber()
  @IsNotEmpty()
  price: number;
}
