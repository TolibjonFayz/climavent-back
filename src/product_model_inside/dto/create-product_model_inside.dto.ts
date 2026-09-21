import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

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

  // ---- Og'irlik va o'lcham (topshiriq №26, 7-band) ----
  @ApiProperty({ example: 42.5, required: false, nullable: true, description: "Og'irlik, kg" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  @Max(100000)
  weight_kg?: number | null;

  @ApiProperty({ example: 120, required: false, nullable: true, description: 'Uzunlik, sm' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(10000)
  length_cm?: number | null;

  @ApiProperty({ example: 80, required: false, nullable: true, description: 'Eni, sm' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(10000)
  width_cm?: number | null;

  @ApiProperty({ example: 60, required: false, nullable: true, description: 'Balandlik, sm' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(10000)
  height_cm?: number | null;
}
