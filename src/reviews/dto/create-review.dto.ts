import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({
    example: 'Very quality, I am using with pleasure',
    description: 'Review for the product',
  })
  @IsString()
  @IsNotEmpty()
  review: string;

  @ApiProperty({
    example: 5,
    description: 'How do you rate this product 1 to 5',
  })
  @IsNumber()
  @IsNotEmpty()
  stars: number;

  @ApiProperty({ example: 1, description: 'User id' })
  @IsNumber()
  @IsNotEmpty()
  user_id: number;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;
}
