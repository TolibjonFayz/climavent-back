import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ProductModelInfosService } from './product_model_infos.service';
import { CreateProductModelInfoDto } from './dto/create-product_model_info.dto';
import { UpdateProductModelInfoDto } from './dto/update-product_model_info.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductModelInfo } from './models/product_model_info.model';

@ApiTags('Product model infos')
@Controller('product-model-infos')
export class ProductModelInfosController {
  constructor(
    private readonly productModelInfosService: ProductModelInfosService,
  ) {}

  //Create product model
  @ApiOperation({ summary: 'Create product model info' })
  @Post('create')
  async create(@Body() createProductModelInfoDto: CreateProductModelInfoDto) {
    return this.productModelInfosService.createProductModelInfo(
      createProductModelInfoDto,
    );
  }

  //Get all product model infos
  @ApiOperation({ summary: 'Get all product model infos' })
  @Get('all')
  async getAll(): Promise<ProductModelInfo[]> {
    return this.productModelInfosService.getAllProductModelInfos();
  }

  //Get product model info by id
  @ApiOperation({ summary: 'Get product model by id' })
  @Get('one/:id')
  async getOne(@Param('id') id: number): Promise<ProductModelInfo> {
    return this.productModelInfosService.getProductModelInfoById(id);
  }

  //Update product model info by id
  @ApiOperation({ summary: 'Update product model by id' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateProductModelInfoDto: UpdateProductModelInfoDto,
  ) {
    return this.productModelInfosService.updateProductModelInfoById(
      id,
      updateProductModelInfoDto,
    );
  }

  //Delete product model info by id
  @ApiOperation({ summary: 'Delete product model info by id' })
  @Delete('delete/:id')
  async deleteOne(@Param('id') id: number) {
    return this.productModelInfosService.deleteProductModelInfoById(id);
  }
}
