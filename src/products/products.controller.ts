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
import { SortProductDto } from './dto/sort-product.dto';
import { SortbyCategoryIdProductDto } from 'src/category/dto/sortbycategoryid-product.dto';
import { GetRecentlyAddedProductsDto } from './dto/getlastadded-product.dto';
import { SearchProductsByQueryDto } from './dto/search-product.dto';

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

  //Search product by query
  @ApiOperation({ summary: 'Search product by query' })
  @Post('search')
  async search(@Body() searchProductsByQueryDto: SearchProductsByQueryDto) {
    return this.productsService.searchProducts(searchProductsByQueryDto);
  }

  //Get all products count
  @ApiOperation({ summary: 'Get all products count' })
  @Get('allcount')
  async getAllCount(): Promise<number> {
    return this.productsService.getAllProductsCount();
  }

  //Get all products
  @ApiOperation({ summary: 'Get all products' })
  @Get('all')
  async getAll(): Promise<Product[]> {
    return this.productsService.getAllProducts();
  }

  //Get all products for admin
  @ApiOperation({ summary: 'Get all products for admin' })
  @Get('alladmin')
  async getAllProductsForAdmin(): Promise<Product[]> {
    return this.productsService.getAllProductsForAdmin();
  }

  //Get last added products
  @ApiOperation({ summary: 'Get last added products' })
  @Post('lastadded')
  async getLastAddedProducts(
    @Body() getRecentlyAddedProductsDto: GetRecentlyAddedProductsDto,
  ): Promise<any> {
    return this.productsService.getRecentlyAddedProducts(
      getRecentlyAddedProductsDto,
    );
  }

  //Get all products by sort
  @ApiOperation({ summary: 'Get products by sort' })
  @Post('bysort')
  async getProductsBySort(
    @Body() searchProductDto: SortProductDto,
  ): Promise<Product[]> {
    return this.productsService.getProductsBySort(searchProductDto);
  }

  //Get products by category
  @ApiOperation({ summary: 'Get products by category' })
  @Post('categoryslug')
  async getBySlug(
    @Body() sortbyCategoryIdProduct: SortbyCategoryIdProductDto,
  ): Promise<Product[]> {
    return this.productsService.sortProductsByCategoryId(
      sortbyCategoryIdProduct,
    );
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
