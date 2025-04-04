import { SortbyCategoryIdProductDto } from 'src/category/dto/sortbycategoryid-product.dto';
import { GetRecentlyAddedProductsDto } from './dto/getlastadded-product.dto';
import { SearchProductsByQueryDto } from './dto/search-product.dto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Category } from 'src/category/model/category.model';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { SortProductDto } from './dto/sort-product.dto';
import { Review } from 'src/reviews/model/review.model';
import { User } from 'src/users/model/user.model';
import { InjectModel } from '@nestjs/sequelize';
import { Product } from './model/product.model';
import Sequelize, { where } from 'sequelize';

const { Op } = Sequelize;
@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product) private readonly productRepository: typeof Product,
    @InjectModel(Category) private readonly categoryRepository: typeof Category,
  ) {}

  //Create product
  async createProduct(createProductDto: CreateProductDto) {
    const newProduct = await this.productRepository.create(createProductDto);
    const response = {
      message: 'Product successfully created',
      newProduct,
    };
    return response;
  }

  //Search product by query
  async searchProducts(searchProductsByQueryDto: SearchProductsByQueryDto) {
    const blogs = await this.productRepository.findAll({
      where: {
        [Op.or]: [
          { name_uz: { [Op.iLike]: `%${searchProductsByQueryDto.text}%` } },
          { name_en: { [Op.iLike]: `%${searchProductsByQueryDto.text}%` } },
          { name_ru: { [Op.iLike]: `%${searchProductsByQueryDto.text}%` } },
        ],
      },
      include: { all: true },
    });
    if (blogs.length == 0) {
      return [{ not: 'Products not found' }];
    }
    return blogs;
  }

  //Get all products
  async getAllProducts() {
    const products = await this.productRepository.findAll({
      include: { all: true },
    });
    return products;
  }

  //Get all products count
  async getAllProductsCount() {
    const products = await this.productRepository.count({});
    return products;
  }

  //Get recently added products
  async getRecentlyAddedProducts(
    getRecentlyAddedProductsDto: GetRecentlyAddedProductsDto,
  ) {
    const offset =
      (getRecentlyAddedProductsDto.page - 1) *
      getRecentlyAddedProductsDto.limit;
    const count = await this.getAllProductsCount();

    const products = await this.productRepository.findAll({
      order: [['createdAt', 'DESC']],
      limit: getRecentlyAddedProductsDto.limit,
      offset: offset,
      include: { all: true },
    });

    const result = {
      totalPages: Math.ceil(count / getRecentlyAddedProductsDto.limit),
      products,
    };
    return result;
  }

  //Get products by sort
  async getProductsBySort(searchProductDto: SortProductDto) {
    const offset = (searchProductDto.page - 1) * searchProductDto.limit;
    //Regular (ommabop) serach
    if (
      searchProductDto.price == 'Ommabop' ||
      searchProductDto.price == 'kopbuyurtirilgan'
    ) {
      const products = await this.productRepository.findAll({
        include: { all: true },
        limit: searchProductDto.limit,
        offset: offset,
      });
      return products;
    }
    //Sorting by ASC or DESC
    else {
      const products = await this.productRepository.findAll({
        include: { all: true },
        order: [['price', searchProductDto.price]],
        limit: searchProductDto.limit,
        offset: offset,
      });
      return products;
    }
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
        limit: sortbyCategoryIdProduct.limit,
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
            limit: sortbyCategoryIdProduct.limit,
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
    //Sorting by ASC or DESC
    else {
      const categoryProducts = await this.productRepository.findAll({
        where: { category_id: sortbyCategoryIdProduct.category_id },
        include: { all: true },
        order: [['price', sortbyCategoryIdProduct.price]],
        limit: sortbyCategoryIdProduct.limit,
      });

      //Parent category products finding
      const allProductsForParentCatIds = [sortbyCategoryIdProduct.category_id];
      let allProductsForParentCatProducts = [];
      const res1 = await this.categoryRepository.findAll({
        where: { category_id: sortbyCategoryIdProduct.category_id },
      });
      if (res1.length) {
        for (let i = 0; i < res1.length; i++) {
          allProductsForParentCatIds.push(res1[i].id);
          const products = await this.productRepository.findAll({
            where: { category_id: res1[i].id },
            include: { all: true },
            limit: sortbyCategoryIdProduct.limit,
          });
          for (let i = 0; i < products.length; i++) {
            allProductsForParentCatProducts.push(products[i]);
          }
        }
        if (sortbyCategoryIdProduct.price == 'ASC')
          allProductsForParentCatProducts =
            allProductsForParentCatProducts.sort((a, b) => a.price - b.price);
        else if (sortbyCategoryIdProduct.price == 'DESC')
          allProductsForParentCatProducts =
            allProductsForParentCatProducts.sort((a, b) => b.price - a.price);
        return allProductsForParentCatProducts;
      } else {
        return categoryProducts;
      }
    }
  }

  //Get product by id
  async getProductById(id: number) {
    const product = await this.productRepository.findOne({
      where: { id: id },
      include: [
        {
          model: Review,
          include: [{ model: User, attributes: ['name'] }],
        },
        { all: true },
      ],
    });
    //Increase views of product
    await this.productRepository.update(
      { views: product.views + 1 },
      { where: { id: id } },
    );
    if (product) return product;
    else
      throw new NotFoundException('Product not found or product id is invalid');
  }

  //Update product by id
  async updateProductById(id: number, updateProductDto: UpdateProductDto) {
    const updated = await this.productRepository.update(updateProductDto, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else return new NotFoundException('Product not found or something wrong');
  }

  //Delete product by id
  async deleteProductById(id: number) {
    const deleting = await this.productRepository.destroy({
      where: { id: id },
    });
    if (deleting) return deleting;
    else throw new NotFoundException('Product not found or something wrong');
  }
}
