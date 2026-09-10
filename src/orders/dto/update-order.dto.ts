import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';
import { ORDER_STATUSES, ORDER_STATUS_MESSAGE } from '../order-status';

// Hamma maydon IXTIYORIY: adminka odatda faqat `status` yuboradi.
// Ilgari bu yerda maydonlar dekoratorsiz e'lon qilingan edi — ya'ni
// global `ValidationPipe` (`whitelist: true`) ularni jimgina tashlab
// yuborardi va faqat `PartialType` dan meros qolgan qoidalar ishlardi.
export class UpdateOrderDto extends PartialType(CreateOrderDto) {
  @ApiProperty({ example: 1, description: 'User id', required: false })
  @IsOptional()
  @IsNumber()
  user_id?: number;

  @ApiProperty({ example: 549000, description: 'Jami summa', required: false })
  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  // Eski o'zbekcha nomlar hozircha qabul qilinadi va servis qatlamida
  // yangisiga aylantiriladi (topshiriq №14, 4-band).
  @ApiProperty({
    example: 'shipping',
    description: ORDER_STATUS_MESSAGE,
    enum: ORDER_STATUSES,
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn([...ORDER_STATUSES, 'Tolanmagan', 'Yetkazilyapti', 'Done'], {
    message: ORDER_STATUS_MESSAGE,
  })
  status?: string;

  @ApiProperty({ example: 'Toshkent', description: 'Manzil', required: false })
  @IsOptional()
  @IsString()
  location?: string;
}
