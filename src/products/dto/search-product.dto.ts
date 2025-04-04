import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class SearchProductsByQueryDto {
  @ApiProperty({ example: 2, description: 'Query text' })
  @IsNotEmpty()
  text: string;
}
