import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ProductImagesService } from './product_images.service';
import { CreateProductImageDto } from './dto/create-product_image.dto';
import { UpdateProductImageDto } from './dto/update-product_image.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductImages } from './model/product_image.model';

@ApiTags('Product images')
@Controller('product-images')
export class ProductImagesController {
  constructor(private readonly productImagesService: ProductImagesService) {}

  //Create product image
  @ApiOperation({ summary: 'Create product image' })
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
  async getOne(@Param('id') id: number): Promise<ProductImages> {
    return this.productImagesService.getProductImageById(id);
  }

  //Update product by id
  @ApiOperation({ summary: 'Update product image by id' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateProductDto: UpdateProductImageDto,
  ) {
    return this.productImagesService.updateProductImageById(
      id,
      updateProductDto,
    );
  }

  //Delete product by id
  @ApiOperation({ summary: 'Delete product image by id' })
  @Delete('delete/:id')
  async deleteOne(@Param('id') id: number) {
    return this.productImagesService.deleteProductImageById(id);
  }
}
