import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// `reviews.review` ustuni VARCHAR(255) (sync bilan yaratilgan). Uzunroq
// matn ilgari bazadan 500 bilan qaytardi — endi tushunarli 400.
export const REVIEW_MAX_LENGTH = 255;

export class CreateReviewDto {
  @ApiProperty({
    example: 'Very quality, I am using with pleasure',
    description: 'Review for the product',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(REVIEW_MAX_LENGTH)
  review: string;

  // Ilgari diapazon tekshirilmasdi: `stars: 1000` yuborib mahsulot
  // reytingini buzish mumkin edi (sayt o'rtachani shundan hisoblaydi).
  @ApiProperty({
    example: 5,
    description: 'How do you rate this product 1 to 5',
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  stars: number;

  @ApiProperty({ example: 1, description: 'User id' })
  @IsInt()
  @IsNotEmpty()
  user_id: number;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsInt()
  @IsNotEmpty()
  product_id: number;
}
