import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ProductModelInsideService } from './product_model_inside.service';
import { CreateProductModelInsideDto } from './dto/create-product_model_inside.dto';
import { UpdateProductModelInsideDto } from './dto/update-product_model_inside.dto';

@Controller('product-model-inside')
export class ProductModelInsideController {
  constructor(private readonly productModelInsideService: ProductModelInsideService) {}

  @Post()
  create(@Body() createProductModelInsideDto: CreateProductModelInsideDto) {
    return this.productModelInsideService.create(createProductModelInsideDto);
  }

  @Get()
  findAll() {
    return this.productModelInsideService.findAll();
  }

  // Bitta model (characteristic) ga tegishli ro'yxat
  @Get('model/:modelId')
  findByModel(@Param('modelId') modelId: string) {
    return this.productModelInsideService.findByModel(+modelId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productModelInsideService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProductModelInsideDto: UpdateProductModelInsideDto) {
    return this.productModelInsideService.update(+id, updateProductModelInsideDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productModelInsideService.remove(+id);
  }
}
