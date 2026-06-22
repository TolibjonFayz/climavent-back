import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  NotFoundException,
} from '@nestjs/common';
import { ProductModelsService } from './product_models.service';
import { CreateProductModelDto } from './dto/create-product_model.dto';
import { UpdateProductModelDto } from './dto/update-product_model.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductModels } from './models/product_model.model';

@ApiTags('Product models')
@Controller('product-models')
export class ProductModelsController {
  constructor(private readonly productModelsService: ProductModelsService) {}

  //Create product model
  @ApiOperation({ summary: 'Create product model' })
  @Post('create')
  async create(@Body() createProductModelDto: CreateProductModelDto) {
    return this.productModelsService.createProductModel(createProductModelDto);
  }

  //Get all product models
  @ApiOperation({ summary: 'Get all product models' })
  @Get('all')
  async getAll(): Promise<ProductModels[]> {
    return this.productModelsService.getAllProductModels();
  }

  //Get product model by id
  @ApiOperation({ summary: 'Get product model by id' })
  @Get('one/:id')
  async getOne(@Param('id') id: number): Promise<ProductModels> {
    return this.productModelsService.getProductModelById(id);
  }

  //Get product model by product id
  @ApiOperation({ summary: 'Get product model by id' })
  @Get('oneproductid/:id')
  async getOneByPdroductid(@Param('id') id: number): Promise<ProductModels> {
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
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() UpdateProductModelDto: UpdateProductModelDto,
  ) {
    return this.productModelsService.updateProductModelById(
      id,
      UpdateProductModelDto,
    );
  }

  //Delete product model by id
  @ApiOperation({ summary: 'Delete product model by id' })
  @Delete('delete/:id')
  async deleteOne(@Param('id') id: number) {
    return this.productModelsService.deleteProductModelById(id);
  }
}
