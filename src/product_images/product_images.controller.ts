import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ProductImagesService } from './product_images.service';
import { CreateProductImageDto } from './dto/create-product_image.dto';
import { UpdateProductImageDto } from './dto/update-product_image.dto';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ProductImages } from './model/product_image.model';
import { JwtOrServiceKeyGuard } from 'src/guards/jwt_or_service_key.guard';
import { StoreAuthGuard } from 'src/store_auth/store_auth.guard';
import { StoreScopeGuard } from 'src/store_auth/store_scope.guard';

@ApiTags('Product images')
@Controller('product-images')
export class ProductImagesController {
  constructor(private readonly productImagesService: ProductImagesService) {}

  //Create product image
  @ApiOperation({ summary: 'Create product image' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, StoreScopeGuard)
  @Post('create')
  async create(@Body() createProfuctImageDto: CreateProductImageDto) {
    return this.productImagesService.createProductImage(createProfuctImageDto);
  }

  //Get all product images
  @ApiOperation({ summary: 'Get all product images' })
  @Get('all')
  async getAll(): Promise<ProductImages[]> {
    return this.productImagesService.getAllProductImages();
  }

  //Get product image by id
  @ApiOperation({ summary: 'Get product image by id' })
  @Get('one/:id')
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<ProductImages> {
    return this.productImagesService.getProductImageById(id);
  }

  //Update product by id
  @ApiOperation({ summary: 'Update product image by id' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, StoreScopeGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductImageDto,
  ) {
    return this.productImagesService.updateProductImageById(
      id,
      updateProductDto,
    );
  }

  //Delete product by id
  @ApiOperation({ summary: 'Delete product image by id' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(StoreAuthGuard, StoreScopeGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id', ParseIntPipe) id: number) {
    return this.productImagesService.deleteProductImageById(id);
  }
}
