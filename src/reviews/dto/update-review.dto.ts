import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateReviewDto } from './create-review.dto';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

// Hamma maydon IXTIYORIY.
//
// Ilgari bu yerda maydonlar `@IsNotEmpty()` bilan qayta e'lon qilingan
// edi — ya'ni `PartialType` ga qaramay HAMMASI majburiy bo'lib qolgandi.
// Natijada moderatsiya uchun yolg'iz `is_hidden` yuborib bo'lmasdi:
// so'rov "review should not be empty" deb rad etilardi.
export class UpdateReviewDto extends PartialType(CreateReviewDto) {
  @ApiProperty({
    example: 'Very quality, I am using with pleasure',
    required: false,
  })
  @IsOptional()
  @IsString()
  review?: string;

  @ApiProperty({ example: 5, required: false })
  @IsOptional()
  @IsNumber()
  stars?: number;

  @ApiProperty({ example: 1, description: 'User id', required: false })
  @IsOptional()
  @IsNumber()
  user_id?: number;

  @ApiProperty({ example: 1, description: 'Product id', required: false })
  @IsOptional()
  @IsNumber()
  product_id?: number;

  // Moderatsiya bayrog'i (topshiriq №14, 3-band). `true` — sharh saytda
  // ko'rinmaydi va `products.reviews_count` ga kirmaydi; adminkada esa
  // qolaveradi va istalgan payt qaytariladi.
  @ApiProperty({
    example: true,
    description: "Sharhni yashirish/qaytarish (o'chirish o'rniga)",
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  is_hidden?: boolean;
}
