import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ example: 1, description: 'User id' })
  @IsNumber()
  @IsNotEmpty()
  user_id: number;

  @ApiProperty({ example: 549000, description: 'Total amount of items id' })
  @IsNumber()
  @IsNotEmpty()
  totalAmount: number;

  @ApiProperty({ example: 'Delivered', description: 'Status of order' })
  @IsNumber()
  @IsNotEmpty()
  status: string;
}
