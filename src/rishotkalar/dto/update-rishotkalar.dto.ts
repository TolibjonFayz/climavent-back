import { IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { CreateRishotkalarDto } from './create-rishotkalar.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export class UpdateRishotkalarDto extends PartialType(CreateRishotkalarDto) {
  @ApiProperty({ example: '4РВП', description: 'Name of the rishotka' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 400, description: 'Length of the rishotka' })
  @IsNumber()
  @IsNotEmpty()
  length: number;

  @ApiProperty({ example: 400, description: 'Width of the rishotka' })
  @IsNumber()
  @IsNotEmpty()
  width: number;

  @ApiProperty({ example: 100000, description: 'Price of the rishotka' })
  @IsNumber()
  @IsNotEmpty()
  price: number;
}
