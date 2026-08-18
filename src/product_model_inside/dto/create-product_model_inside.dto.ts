import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

  @ApiProperty({
    example: 120.5,
    description:
      "Narx, DOLLARDA (USD). Ixtiyoriy — yubormasangiz NULL bo'lib qoladi.",
    required: false,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;
}
