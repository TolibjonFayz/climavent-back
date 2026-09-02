import { Controller, Get, Post, Body, Patch, Param, ParseIntPipe, Query, Delete, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { ProductModelInsideService } from './product_model_inside.service';
import { CreateProductModelInsideDto } from './dto/create-product_model_inside.dto';
import { UpdateProductModelInsideDto } from './dto/update-product_model_inside.dto';
import { JwtOrServiceKeyGuard } from 'src/guards/jwt_or_service_key.guard';
import { parsePositiveIntParam } from 'src/common/helpers/pagination';

@Controller('product-model-inside')
export class ProductModelInsideController {
  constructor(private readonly productModelInsideService: ProductModelInsideService) {}

  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiResponse({
    status: 201,
    description: 'SAP varianti yaratildi',
    schema: {
      example: {
        id: 981,
        sap_name: 'VKPP 60-35-4D',
        in_model_name: 'VKPP 60-35',
        product_model_id: 305,
        price: 120.5,
      },
    },
  })
  @UseGuards(JwtOrServiceKeyGuard)
  @Post()
  create(@Body() createProductModelInsideDto: CreateProductModelInsideDto) {
    return this.productModelInsideService.create(createProductModelInsideDto);
  }

  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.productModelInsideService.findAll(
      parsePositiveIntParam(page, 'page'),
      parsePositiveIntParam(limit, 'limit'),
    );
  }

  // Bitta model (characteristic) ga tegishli ro'yxat
  @Get('model/:modelId')
  findByModel(@Param('modelId', ParseIntPipe) modelId: number) {
    return this.productModelInsideService.findByModel(modelId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productModelInsideService.findOne(id);
  }

  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateProductModelInsideDto: UpdateProductModelInsideDto) {
    return this.productModelInsideService.update(id, updateProductModelInsideDto);
  }

  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productModelInsideService.remove(id);
  }
}
