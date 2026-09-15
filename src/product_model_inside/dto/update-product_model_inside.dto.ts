import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsPositive } from 'class-validator';
import { CreateProductModelInsideDto } from './create-product_model_inside.dto';

// PATCH — hamma maydon ixtiyoriy. Maydonlarni bu yerda QAYTA E'LON QILMANG
// (PartialType bergan ixtiyoriylik bekor bo'ladi) — faqat yangi maydonlar.
export class UpdateProductModelInsideDto extends PartialType(CreateProductModelInsideDto) {
  // ---- Aksiya (topshiriq №15). Qoidalar: `common/pricing/sale-update.ts`.
  @ApiProperty({ example: 103.12, required: false, nullable: true, description: "Aksiya narxi (USD). null — aksiyani olib tashlash" })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "sale_price son bo'lsin (ko'pi bilan 2 xona)" })
  @IsPositive({ message: "sale_price 0 dan katta bo'lsin" })
  sale_price?: number | null;

  @ApiProperty({ example: '2026-09-16T00:00:00+05:00', required: false, nullable: true })
  @IsOptional()
  @IsDateString({}, { message: "sale_starts_at ISO sana bo'lsin" })
  sale_starts_at?: string | null;

  @ApiProperty({ example: '2026-09-30T23:59:59+05:00', required: false, nullable: true })
  @IsOptional()
  @IsDateString({}, { message: "sale_ends_at ISO sana bo'lsin" })
  sale_ends_at?: string | null;
}
