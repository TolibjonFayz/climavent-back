import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateProductModelInsideDto {
  @ApiProperty({
    example: 'ВЦ 4-75-2,5-О-1-0,12/1500',
    description: 'SAP model name',
  })
  @IsString()
  @IsNotEmpty()
  sap_name: string;

  @ApiProperty({ example: 'VS14-46', description: 'Internal model name' })
  @IsString()
  @IsNotEmpty()
  in_model_name: string;

  @ApiProperty({ example: 1, description: 'Characteristic (model) id' })
  @IsNumber()
  @IsNotEmpty()
  product_model_id: number;
}
