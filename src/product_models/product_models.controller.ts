import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  Query,
  Delete,
  NotFoundException,
  UseGuards,
  ParseArrayPipe,
} from '@nestjs/common';
import { ProductModelsService } from './product_models.service';
import { CreateProductModelDto } from './dto/create-product_model.dto';
import { UpdateProductModelDto } from './dto/update-product_model.dto';
import { BulkPriceItemDto } from './dto/bulk-price.dto';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ProductModels } from './models/product_model.model';
import { JwtOrServiceKeyGuard } from 'src/guards/jwt_or_service_key.guard';
import { parsePositiveIntParam } from 'src/common/helpers/pagination';

@ApiTags('Product models')
@Controller('product-models')
export class ProductModelsController {
  constructor(private readonly productModelsService: ProductModelsService) {}

  //Create product model
  @ApiOperation({ summary: 'Create product model' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Post('create')
  async create(@Body() createProductModelDto: CreateProductModelDto) {
    return this.productModelsService.createProductModel(createProductModelDto);
  }

  //Get all product models (updatedAfter/airflow_min/airflow_max/page/limit ixtiyoriy)
  @ApiOperation({ summary: 'Get all product models' })
  @Get('all')
  async getAll(
    @Query('updatedAfter') updatedAfter?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('airflow_min') airflowMin?: string,
    @Query('airflow_max') airflowMax?: string,
  ): Promise<ProductModels[]> {
    return this.productModelsService.getAllProductModels(
      updatedAfter,
      parsePositiveIntParam(page, 'page'),
      parsePositiveIntParam(limit, 'limit'),
      airflowMin !== undefined ? parsePositiveIntParam(airflowMin, 'airflow_min') : undefined,
      airflowMax !== undefined ? parsePositiveIntParam(airflowMax, 'airflow_max') : undefined,
    );
  }

  //Narxlarni ommaviy yuklash — faqat bot/admin
  @ApiOperation({ summary: 'Bulk update model prices (admin/bot)' })
  @ApiBody({ type: [BulkPriceItemDto] })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Post('bulk-price')
  async bulkPrice(
    @Body(new ParseArrayPipe({ items: BulkPriceItemDto }))
    items: BulkPriceItemDto[],
  ) {
    return this.productModelsService.bulkUpdatePrices(items);
  }

  //Get product model by id
  @ApiOperation({ summary: 'Get product model by id' })
  @Get('one/:id')
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<ProductModels> {
    return this.productModelsService.getProductModelById(id);
  }

  //Get product model by product id
  @ApiOperation({ summary: 'Get product model by id' })
  @Get('oneproductid/:id')
  async getOneByPdroductid(@Param('id', ParseIntPipe) id: number): Promise<ProductModels> {
    return this.productModelsService.getProductModelByProductId(id);
  }

  // Get product model by slot
  @ApiOperation({ summary: 'Get product model by slot' })
  @Get('slot/:slot')
  async getOneBySlot(@Param('slot') slot: string): Promise<ProductModels> {
    try {
      const productModel =
        await this.productModelsService.getProductModelBySlot(slot);
      if (!productModel) {
        throw new NotFoundException(
          'Product model not found or slot is invalid',
        );
      }
      return productModel;
    } catch (error) {
      throw new NotFoundException('Product model not found or slot is invalid');
    }
  }

  //Update product model by id
  @ApiOperation({ summary: 'Update product model by id' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() UpdateProductModelDto: UpdateProductModelDto,
  ) {
    return this.productModelsService.updateProductModelById(
      id,
      UpdateProductModelDto,
    );
  }

  //Delete product model by id
  @ApiOperation({ summary: 'Delete product model by id' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id', ParseIntPipe) id: number) {
    return this.productModelsService.deleteProductModelById(id);
  }
}
