import { PartialType } from '@nestjs/swagger';
import { CreateProductModelInsideDto } from './create-product_model_inside.dto';

export class UpdateProductModelInsideDto extends PartialType(CreateProductModelInsideDto) {}
