import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ProductModelHeadersService } from './product_model_headers.service';
import { CreateProductModelHeaderDto } from './dto/create-product_model_header.dto';
import { UpdateProductModelHeaderDto } from './dto/update-product_model_header.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductModelHeader } from './models/product_model_header.model';

@ApiTags('Product model headers')
@Controller('product-model-headers')
export class ProductModelHeadersController {
  constructor(
    private readonly productModelHeadersService: ProductModelHeadersService,
  ) {}

  //Create product model header
  @ApiOperation({ summary: 'Create product model header' })
  @Post('create')
  async create(
    @Body() createProductModelHeaderDto: CreateProductModelHeaderDto,
  ) {
    return this.productModelHeadersService.createProductModelHeader(
      createProductModelHeaderDto,
    );
  }

  //Get all product model headers
  @ApiOperation({ summary: 'Get all product model headers' })
  @Get('all')
  async getAll(): Promise<ProductModelHeader[]> {
    return this.productModelHeadersService.getAllProductModelHeaders();
  }

  //Get product model header by id
  @ApiOperation({ summary: 'Get product model header by id' })
  @Get('one/:id')
  async getOne(@Param('id') id: number): Promise<ProductModelHeader> {
    return this.productModelHeadersService.getProductModelHeaderById(id);
  }

  //Update product model header by id
  @ApiOperation({ summary: 'Update product model header by id' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() UpdateProductModelHeaderDto: UpdateProductModelHeaderDto,
  ) {
    return this.productModelHeadersService.updateProductModelHeaderById(
      id,
      UpdateProductModelHeaderDto,
    );
  }

  //Delete product model header by id
  @ApiOperation({ summary: 'Delete product model header by id' })
  @Delete('delete/:id')
  async deleteOne(@Param('id') id: number) {
    return this.productModelHeadersService.deleteProductModelHeaderById(id);
  }
}
