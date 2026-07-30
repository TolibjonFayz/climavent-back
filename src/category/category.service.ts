import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Product } from 'src/products/model/product.model';
import { Category } from './model/category.model';
import { InjectModel } from '@nestjs/sequelize';
import { SortbyCategoryIdProductDto } from './dto/sortbycategoryid-product.dto';

@Injectable()
export class CategoryService {
  constructor(
    @InjectModel(Category) private readonly categoryRepository: typeof Category,
    @InjectModel(Product) private readonly productRepository: typeof Product,
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

  //Get products by category
  async sortProductsByCategoryId(
    sortbyCategoryIdProduct: SortbyCategoryIdProductDto,
  ) {
    //Regular (ommabop) serach
    if (
      sortbyCategoryIdProduct.price == 'Ommabop' ||
      sortbyCategoryIdProduct.price == 'kopbuyurtirilgan'
    ) {
      const categoryProducts = await this.productRepository.findAll({
        where: { category_id: sortbyCategoryIdProduct.category_id },
        include: { all: true },
      });

      //Parent category products finding
      const allProductsForParentCatIds = [];
      const res = await this.categoryRepository.findAll({
        where: { category_id: sortbyCategoryIdProduct.category_id },
      });
      if (res.length) {
        for (let i = 0; i < res.length; i++) {
          const hehe = await this.productRepository.findAll({
            where: { category_id: res[i].id },
            include: { all: true },
          });
          for (let index = 0; index < hehe.length; index++) {
            allProductsForParentCatIds.push(hehe[index]);
          }
        }
        return allProductsForParentCatIds;
      } else {
        return categoryProducts;
      }
    }
    //Sorting by ASC or DESC — narx endi product'da emas, characteristics(models)'da,
    //shuning uchun DB darajasida emas, JS darajasida sort qilinadi
    else {
      const categoryProducts = await this.productRepository.findAll({
        where: { category_id: sortbyCategoryIdProduct.category_id },
        include: { all: true },
      });

      //Parent category products finding
      const allProductsForParentCatIds = [];
      const res = await this.categoryRepository.findAll({
        where: { category_id: sortbyCategoryIdProduct.category_id },
      });
      let result: Product[];
      if (res.length) {
        for (let i = 0; i < res.length; i++) {
          const hehe = await this.productRepository.findAll({
            where: { category_id: res[i].id },
            include: { all: true },
          });
          for (let index = 0; index < hehe.length; index++) {
            allProductsForParentCatIds.push(hehe[index]);
          }
        }
        result = allProductsForParentCatIds;
      } else {
        result = categoryProducts;
      }

      return this.sortByCharacteristicPrice(result, sortbyCategoryIdProduct.price);
    }
  }

  // Product'ning eng arzon modeli (characteristics ichidagi eng kichik narx)
  private getMinCharacteristicPrice(product: Product): number {
    const prices = (product.characters || []).map((c) => c.price);
    return prices.length ? Math.min(...prices) : 0;
  }

  private sortByCharacteristicPrice(products: Product[], direction: string) {
    return [...products].sort((a, b) => {
      const diff =
        this.getMinCharacteristicPrice(a) - this.getMinCharacteristicPrice(b);
      return direction === 'ASC' ? diff : -diff;
    });
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
