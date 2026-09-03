import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
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

  // SAP varianti tanlanganini qayd qilish — OCHIQ endpoint (mehmonlar
  // ham mahsulot ko'radi). Model uchun qanday bo'lsa, xuddi shunday.
  @ApiOperation({ summary: 'SAP varianti tanlanganini sanash (views +1)' })
  @ApiResponse({ status: 201, description: 'Sanaldi', schema: { example: { message: 'ok' } } })
  @ApiResponse({ status: 404, description: 'Topilmadi' })
  @Throttle({ default: { limit: 40, ttl: 60 * 1000 } })
  @Post(':id/view')
  countView(@Param('id', ParseIntPipe) id: number) {
    return this.productModelInsideService.incrementViews(id);
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
