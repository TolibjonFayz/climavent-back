import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Product } from './model/product.model';
import { UpdateProductDto } from './dto/update-product.dto';
import { SortProductDto } from './dto/sort-product.dto';
import { SortbyCategoryIdProductDto } from 'src/category/dto/sortbycategoryid-product.dto';
import { Category } from 'src/category/model/category.model';

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

  //Get all products
  async getAllProducts() {
    const products = await this.productRepository.findAll({
      include: { all: true },
    });
    return products;
  }

  //Get products by sort
  async getProductsBySort(searchProductDto: SortProductDto) {
    //Regular (ommabop) serach
    if (
      searchProductDto.price == 'Ommabop' ||
      searchProductDto.price == 'kopbuyurtirilgan'
    ) {
      const products = await this.productRepository.findAll({
        include: { all: true },
      });
      return products;
    }
    //Sorting by ASC or DESC
    else {
      const products = await this.productRepository.findAll({
        include: { all: true },
        order: [['price', searchProductDto.price]],
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
    //Sorting by ASC or DESC
    else {
      const categoryProducts = await this.productRepository.findAll({
        where: { category_id: sortbyCategoryIdProduct.category_id },
        include: { all: true },
        order: [['price', sortbyCategoryIdProduct.price]],
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
      include: { all: true },
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
