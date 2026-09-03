import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  Delete,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtOrServiceKeyGuard } from 'src/guards/jwt_or_service_key.guard';
import { Product } from './model/product.model';
import { SortProductDto } from './dto/sort-product.dto';
import { SortbyCategoryIdProductDto } from 'src/category/dto/sortbycategoryid-product.dto';
import { GetRecentlyAddedProductsDto } from './dto/getlastadded-product.dto';
import { SearchProductsByQueryDto } from './dto/search-product.dto';
import { parsePositiveIntParam } from 'src/common/helpers/pagination';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  //Create product
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiOperation({ summary: 'Create product (admin)' })
  // DIQQAT: `id` javobning ILDIZIDA emas, `newProduct` ichida.
  @ApiResponse({
    status: 201,
    description: 'Mahsulot yaratildi',
    schema: {
      example: {
        message: 'Product successfully created',
        newProduct: { id: 220, name_uz: 'Kanalli ventilyator', quantity: 10 },
      },
    },
  })
  @ApiResponse({ status: 400, description: "Noto'g'ri tana" })
  @ApiResponse({ status: 401, description: 'Guvohnoma yaroqsiz' })
  @UseGuards(JwtOrServiceKeyGuard)
  @Post('create')
  async create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.createProduct(createProductDto);
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

  //Get all products (page/limit/store_id ixtiyoriy)
  @ApiOperation({ summary: 'Get all products' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: "Sahifa raqami. Standart: 1",
    example: '1',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description:
      "Nechta qaytarilsin. BERILMASA STANDART 20 — ya'ni parametrsiz " +
      "so'rov butun katalogni EMAS, faqat 20 tasini qaytaradi. " +
      "To'liq ro'yxat uchun limit'ni aniq bering (masalan limit=300) " +
      'yoki /products/alladmin dan foydalaning.',
    example: '20',
  })
  @ApiQuery({
    name: 'store_id',
    required: false,
    description: "Berilsa faqat shu do'kon mahsulotlari qaytadi",
    example: '2',
  })
  @ApiResponse({ status: 200, description: 'Mahsulotlar', type: [Product] })
  @Get('all')
  async getAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('store_id') storeId?: string,
  ): Promise<Product[]> {
    return this.productsService.getAllProducts(
      parsePositiveIntParam(page, 'page'),
      parsePositiveIntParam(limit, 'limit'),
      parsePositiveIntParam(storeId, 'store_id'),
    );
  }

  //Get all products for admin
  // Eslatma: bu endpoint sitemap (nuxt.config) tomonidan tokensiz ishlatiladi
  // va faqat katalog darajasidagi maydonlarni qaytaradi, shuning uchun ochiq.
  @ApiOperation({ summary: 'Get all products for admin' })
  @ApiQuery({
    name: 'store_id',
    required: false,
    description: "Berilsa faqat shu do'kon mahsulotlari qaytadi",
    example: '2',
  })
  @ApiResponse({
    status: 200,
    description: "Qisqartirilgan ro'yxat (producer va views bilan)",
    type: [Product],
  })
  @Get('alladmin')
  async getAllProductsForAdmin(
    @Query('store_id') storeId?: string,
  ): Promise<Product[]> {
    return this.productsService.getAllProductsForAdmin(
      parsePositiveIntParam(storeId, 'store_id'),
    );
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

  //Get product by id.
  //Ko'rish hisoblagichi FAQAT haqiqiy mijoz tashrifida oshadi:
  //  - `X-API-Key` bilan kelgan so'rov (bot/adminka) sanalmaydi;
  //  - `?count=false` bilan ham o'chirib qo'yish mumkin.
  @ApiOperation({ summary: 'Get product by id' })
  @ApiQuery({
    name: 'count',
    required: false,
    description:
      "`false` bo'lsa ko'rish hisoblagichi oshmaydi. Servis kaliti " +
      "(X-API-Key) bilan kelgan so'rovlar baribir sanalmaydi.",
    example: 'false',
  })
  @ApiResponse({ status: 200, description: 'Mahsulot topildi', type: Product })
  @ApiResponse({ status: 404, description: 'Mahsulot topilmadi' })
  @Get('one/:id')
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @Query('count') count?: string,
  ): Promise<Product> {
    const isService = Boolean(req.headers['x-api-key']);
    const countView = !isService && count !== 'false';
    return this.productsService.getProductById(id, countView);
  }

  //Update product by id
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiOperation({ summary: 'Update product by id (admin)' })
  @UseGuards(JwtOrServiceKeyGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.updateProductById(id, updateProductDto);
  }

  //Delete product by id
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiOperation({ summary: 'Delete product by id (admin)' })
  @UseGuards(JwtOrServiceKeyGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.deleteProductById(id);
  }
}
