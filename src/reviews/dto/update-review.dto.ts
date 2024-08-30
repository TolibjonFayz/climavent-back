import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateReviewDto } from './create-review.dto';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateReviewDto extends PartialType(CreateReviewDto) {
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
