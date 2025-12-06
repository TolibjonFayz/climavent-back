import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateCharacteristicDto {
  @ApiProperty({
    example: 'BO 45',
    description: 'Title of the characteristic',
  })
  title: string;

  @ApiProperty({
    example: '45 GB',
    description: 'Value of the characteristic',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    example: '45 GB as JSON',
    description: 'Value of the characteristic as JSON',
  })
  @IsNotEmpty()
  contentJson: string;

  @ApiProperty({ example: '25000', description: 'Price of the character' })
  @IsNumber()
  price: number;

  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;
}
