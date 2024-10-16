import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Category } from './model/category.model';
import { Product } from 'src/products/model/product.model';
import { SortbyCategoryIdProductDto } from './dto/sortbycategoryid-product.dto';

@ApiTags('Category')
@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  //Create category
  @ApiOperation({ summary: 'Create category' })
  @Post('create')
  async create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.createCategory(createCategoryDto);
  }

  //Get all categories
  @ApiOperation({ summary: 'Get all categories' })
  @Get('all')
  async getAll(): Promise<Category[]> {
    return this.categoryService.getAllCategories();
  }

  //Get category by id
  @ApiOperation({ summary: 'Get category by id' })
  @Get('one/:id')
  async getOne(@Param('id') id: number): Promise<Category> {
    return this.categoryService.getCategoryById(id);
  }

  //Get products by category
  @ApiOperation({ summary: 'Get products by category' })
  @Post('slug')
  async getBySlug(
    @Body() sortbyCategoryIdProduct: SortbyCategoryIdProductDto,
  ): Promise<Product[]> {
    return this.categoryService.sortProductsByCategoryId(
      sortbyCategoryIdProduct,
    );
  }

  //Update category by id
  @ApiOperation({ summary: 'Update category by id' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoryService.updateCategoryById(id, updateCategoryDto);
  }

  //Delete category by id
  @ApiOperation({ summary: 'Delete category by id' })
  @Delete('delete/:id')
  async deleteOne(@Param('id') id: number) {
    return this.categoryService.deleteCategoryById(id);
  }
}
