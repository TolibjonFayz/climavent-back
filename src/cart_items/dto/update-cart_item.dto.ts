import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateCartItemDto } from './create-cart_item.dto';
import { IsNotEmpty, IsNumber, IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdateCartItemDto extends PartialType(CreateCartItemDto) {
  @ApiProperty({ example: 1, description: 'Cart id' })
  @IsNumber()
  @IsNotEmpty()
  cart_id: number;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;

  // Narxsiz qator ham tahrirlanadi (topshiriq №25, 1-band): `null` — narxi
  // kelishiladi. DIQQAT: bu sinfda maydonlar `PartialType` ustidan qayta
  // e'lon qilingan va shu sababli MAJBURIY bo'lib qolgan (eski xato) —
  // `price` ataylab ixtiyoriy qilindi.
  @ApiProperty({ example: 543000, required: false, nullable: true, description: "Narx (so'm); null — narxi kelishiladi" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  price?: number | null;

  @ApiProperty({
    example: 'ВНВ243.1-078-050-02-2,2-04-1',
    description: 'Product model name',
  })
  @IsString()
  @IsNotEmpty()
  product_model: string;

  @ApiProperty({ example: 52, description: 'Quantity of product' })
  @IsNumber()
  @IsNotEmpty()
  quantity: number;
}
