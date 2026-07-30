import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { ProductModelInsideService } from './product_model_inside.service';
import { CreateProductModelInsideDto } from './dto/create-product_model_inside.dto';
import { UpdateProductModelInsideDto } from './dto/update-product_model_inside.dto';
import { JwtOrServiceKeyGuard } from 'src/guards/jwt_or_service_key.guard';

@Controller('product-model-inside')
export class ProductModelInsideController {
  constructor(private readonly productModelInsideService: ProductModelInsideService) {}

  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
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

  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProductModelInsideDto: UpdateProductModelInsideDto) {
    return this.productModelInsideService.update(+id, updateProductModelInsideDto);
  }

  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productModelInsideService.remove(+id);
  }
}
