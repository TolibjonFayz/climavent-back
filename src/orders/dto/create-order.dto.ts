import { ApiProperty } from '@nestjs/swagger';
import {
  ORDER_STATUSES,
  ORDER_STATUS_MESSAGE,
} from '../order-status';
import { IsIn, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ example: 1, description: 'User id' })
  @IsNumber()
  @IsNotEmpty()
  user_id: number;

  @ApiProperty({ example: 549000, description: 'Total amount of items id' })
  @IsNumber()
  @IsNotEmpty()
  totalAmount: number;

  // Qat'iy ro'yxat (topshiriq №14, 4-band). Eski o'zbekcha nomlar
  // ("Tolanmagan", "Yetkazilyapti", "Done") hozircha servis qatlamida
  // qabul qilinib, yangisiga aylantiriladi — shuning uchun bu yerda
  // `@IsIn` ro'yxatiga ular ham kiritilgan.
  @ApiProperty({
    example: 'new',
    description: ORDER_STATUS_MESSAGE,
    enum: ORDER_STATUSES,
  })
  @IsString()
  @IsNotEmpty()
  @IsIn([...ORDER_STATUSES, 'Tolanmagan', 'Yetkazilyapti', 'Done'], {
    message: ORDER_STATUS_MESSAGE,
  })
  status: string;

  @ApiProperty({ example: 'Location', description: 'Location of order' })
  @IsString()
  @IsNotEmpty()
  location: string;
}
