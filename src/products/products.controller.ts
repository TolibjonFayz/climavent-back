import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Product } from './model/product.model';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  //Create product
  @ApiOperation({ summary: 'Create product' })
  @Post('create')
  async create(@Body() createProfuctDto: CreateProductDto) {
    return this.productsService.createProduct(createProfuctDto);
  }

  //Get all products
  @ApiOperation({ summary: 'Get all products' })
  @Get('all')
  async getAll(): Promise<Product[]> {
    return this.productsService.getAllProducts();
  }

  //Get product by id
  @ApiOperation({ summary: 'Get product by id' })
  @Get('one/:id')
  async getOne(@Param('id') id: number): Promise<Product> {
    return this.productsService.getProductById(id);
  }

  //Update product by id
  @ApiOperation({ summary: 'Update product by id' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateProducrDto: UpdateProductDto,
  ) {
    return this.productsService.updateProductById(id, updateProducrDto);
  }

  //Delete product by id
  @ApiOperation({ summary: 'Delete product by id' })
  @Delete('delete/:id')
  async deleteOne(@Param('id') id: number) {
    return this.productsService.deleteProductById(id);
  }
}
