import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './model/category.model';
import { InjectModel } from '@nestjs/sequelize';

@Injectable()
export class CategoryService {
  constructor(
    @InjectModel(Category) private readonly categoryRepository: typeof Category,
  ) {}

  //Create category
  async createCategory(createCategoryDto: CreateCategoryDto) {
    const newCategory = await this.categoryRepository.create(createCategoryDto);
    const response = {
      message: 'Category successfully created',
      newCategory,
    };
    return response;
  }

  //Get all categories
  async getAllCategories() {
    const categories = await this.categoryRepository.findAll({
      include: { all: true },
    });
    return categories;
  }

  //Get category by id
  async getCategoryById(id: number) {
    const category = await this.categoryRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (category) return category;
    else
      throw new NotFoundException(
        'Category not found or category id is invalid',
      );
  }

  //Update category by id
  async updateCategoryById(id: number, updateCategoryDto: UpdateCategoryDto) {
    const updated = await this.categoryRepository.update(updateCategoryDto, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else return new NotFoundException('Category not found or something wrong');
  }

  //Delete category by id
  async deleteCategoryById(id: number) {
    const deleting = await this.categoryRepository.destroy({
      where: { id: id },
    });
    if (deleting) return deleting;
    else throw new NotFoundException('Category not found or something wrong');
  }
}
