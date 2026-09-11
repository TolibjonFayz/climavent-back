import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSelectedToCheckoutDto {
  @ApiProperty({ example: 1, description: 'Product id' })
  @IsNumber()
  @IsNotEmpty()
  product_id: number;

  @ApiProperty({ example: 1, description: 'User id' })
  @IsNumber()
  @IsNotEmpty()
  user_id: number;

  @ApiProperty({ example: 'jajsdbnifuab', description: 'Product model' })
  @IsString()
  @IsNotEmpty()
  product_model: string;

  @ApiProperty({ example: 23, description: 'Product quantity' })
  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @ApiProperty({ example: 25000, description: 'Product price' })
  @IsNumber()
  @IsNotEmpty()
  price: number;

  // Savat qatoridan ko'chiriladi — buyurtma narxi aynan tanlangan variant
  // bo'yicha hisoblanishi uchun (topshiriq №13, 4-band). Ixtiyoriy: eski
  // mijozlar yubormasa ham ishlaydi.
  @ApiProperty({ example: 253, required: false, description: 'Model id' })
  @IsOptional()
  @IsInt()
  characteristic_id?: number;

  @ApiProperty({ example: 331, required: false, description: 'SAP varianti id' })
  @IsOptional()
  @IsInt()
  product_model_inside_id?: number;
}
