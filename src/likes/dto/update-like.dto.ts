import { IsNotEmpty, IsNumber } from 'class-validator';
import { CreateLikeDto } from './create-like.dto';
import { PartialType } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateLikeDto extends PartialType(CreateLikeDto) {
  @ApiProperty({ example: 1, description: 'User id' })
  @IsNumber()
  @IsNotEmpty()
  user_id: number;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;
}
