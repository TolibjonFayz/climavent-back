import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateOrderItemDto } from './create-order_item.dto';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

// Hamma maydon IXTIYORIY.
//
// Ilgari maydonlar `@IsNotEmpty()` bilan qayta e'lon qilingan edi — ya'ni
// `PartialType` ga qaramay HAMMASI majburiy bo'lib qolgandi va yolg'iz
// `quantity` ni o'zgartirib bo'lmasdi.
//
// Kim nimani o'zgartira oladi — servisda (`updateOrderItemById`):
// mijoz faqat `quantity`, sayt admini esa narxni ham (kelishilgan narx).
export class UpdateOrderItemDto extends PartialType(CreateOrderItemDto) {
  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsNumber()
  order_id?: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsNumber()
  product_id?: number;

  @ApiProperty({ example: 'HVAUSDHVOH', required: false })
  @IsOptional()
  @IsString()
  product_model?: string;

  @ApiProperty({ example: 2, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  // Faqat sayt admini uchun: "so'rov bo'yicha" modelning kelishilgan narxi.
  // Mijoz yuborsa e'tiborga olinmaydi.
  @ApiProperty({
    example: 1200000,
    required: false,
    nullable: true,
    description: "Bir dona narxi (so'm) — faqat admin o'zgartira oladi",
  })
  @IsOptional()
  @IsInt()
  price?: number;
}
