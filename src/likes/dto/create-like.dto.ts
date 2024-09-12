import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class CreateLikeDto {
  @ApiProperty({ example: 1, description: 'User id' })
  @IsNumber()
  @IsNotEmpty()
  user_id: number;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;
}
