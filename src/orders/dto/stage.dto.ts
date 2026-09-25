import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/** Yig'ish bosqichi (topshiriq №38, 1-band). `waiting` ga qaytib bo'lmaydi. */
export class StageDto {
  @ApiProperty({ example: 'packing', enum: ['packing', 'ready'] })
  @IsIn(['packing', 'ready'], { message: 'stage: packing yoki ready' })
  stage: string;
}
