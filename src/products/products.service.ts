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
import { v4 as uuidv4 } from 'uuid';
import { R2Service } from 'src/r2/r2.service';

const { Op } = Sequelize;
@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product) private readonly productRepository: typeof Product,
    @InjectModel(Category) private readonly categoryRepository: typeof Category,
    private r2Service: R2Service,
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
      attributes: ['id', 'name_uz', 'name_en', 'name_ru'],
    });
    // Topilmasa bo'sh massiv qaytaramiz (frontend uni .length === 0 bilan tekshiradi)
    return blogs;
  }

  //Get all products
  async getAllProducts() {
    const products = await this.productRepository.findAll({
      include: { all: true },
    });
    return products;
  }

  //Get all products FOR ADMIN
  async getAllProductsForAdmin() {
    const products = await this.productRepository.findAll({
      order: [['createdAt', 'DESC']],
      attributes: [
        'name_uz',
        'name_ru',
        'name_en',
        'price',
        'quantity',
        'description_short_uz',
        'id',
      ],
      include: ['category'],
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

  // Sort qiymatini Sequelize order bandiga aylantiradi
  // 'Ommabop' -> views, 'kopbuyurtirilgan' -> sold_count, 'ASC'/'DESC' -> price
  private buildOrder(price: string): any[] | null {
    if (price === 'Ommabop') return [['views', 'DESC']];
    if (price === 'kopbuyurtirilgan') return [['sold_count', 'DESC']];
    if (price === 'ASC' || price === 'DESC') return [['price', price]];
    return null;
  }

  //Get products by sort
  async getProductsBySort(searchProductDto: SortProductDto) {
    const offset = (searchProductDto.page - 1) * searchProductDto.limit;
    const order = this.buildOrder(searchProductDto.price);

    return this.productRepository.findAll({
      include: { all: true },
      ...(order ? { order } : {}),
      limit: searchProductDto.limit,
      offset,
    });
  }

  //Get products by category (+ bola kategoriyalar) — bitta query, DB darajasida sort
  async sortProductsByCategoryId(
    sortbyCategoryIdProduct: SortbyCategoryIdProductDto,
  ) {
    const order = this.buildOrder(sortbyCategoryIdProduct.price);

    // Bola (sub) kategoriyalarni topamiz
    const children = await this.categoryRepository.findAll({
      where: { category_id: sortbyCategoryIdProduct.category_id },
      attributes: ['id'],
    });

    // Parent kategoriya + barcha bola kategoriyalar id'lari
    const categoryIds = [
      sortbyCategoryIdProduct.category_id,
      ...children.map((c) => c.id),
    ];

    return this.productRepository.findAll({
      where: { category_id: { [Op.in]: categoryIds } },
      include: { all: true },
      ...(order ? { order } : {}),
      limit: sortbyCategoryIdProduct.limit,
    });
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
    // Avval null tekshiruvi — aks holda product.views da crash bo'ladi
    if (!product) {
      throw new NotFoundException('Product not found or product id is invalid');
    }
    //Increase views of product
    await this.productRepository.update(
      { views: product.views + 1 },
      { where: { id: id } },
    );
    return product;
  }

  //Update product by id
  async updateProductById(id: number, updateProductDto: UpdateProductDto) {
    //Updating size
    if (
      Object.keys(updateProductDto).includes('sizes') &&
      Object.keys(updateProductDto).includes('sizesJson') &&
      Object.keys(updateProductDto).length == 2
    ) {
      const sizesR2Link = await this.r2Service.uploadJson(
        uuidv4(),
        updateProductDto.sizes,
      );
      const sizesJsonR2Link = await this.r2Service.uploadJson(
        uuidv4(),
        updateProductDto.sizesJson,
      );
      updateProductDto.sizes = sizesR2Link;
      updateProductDto.sizesJson = sizesJsonR2Link;
    }

    //Updating opisaniya
    else if (
      Object.keys(updateProductDto).includes('opisaniya') &&
      Object.keys(updateProductDto).includes('opisaniyaJson') &&
      Object.keys(updateProductDto).length == 2
    ) {
      const opisaniyaR2Link = await this.r2Service.uploadJson(
        uuidv4(),
        updateProductDto.opisaniya,
      );
      const opisaniyaJsonR2Link = await this.r2Service.uploadJson(
        uuidv4(),
        updateProductDto.opisaniyaJson,
      );
      updateProductDto.opisaniya = opisaniyaR2Link;
      updateProductDto.opisaniyaJson = opisaniyaJsonR2Link;
    }

    //Updating naznacheniya
    else if (
      Object.keys(updateProductDto).includes('naznacheniya') &&
      Object.keys(updateProductDto).includes('naznacheniyaJson') &&
      Object.keys(updateProductDto).length == 2
    ) {
      const naznacheniyaR2Link = await this.r2Service.uploadJson(
        uuidv4(),
        updateProductDto.naznacheniya,
      );
      const naznacheniyaJsonR2Link = await this.r2Service.uploadJson(
        uuidv4(),
        updateProductDto.naznacheniyaJson,
      );
      updateProductDto.naznacheniya = naznacheniyaR2Link;
      updateProductDto.naznacheniyaJson = naznacheniyaJsonR2Link;
    }

    //Updating markirovka
    else if (
      Object.keys(updateProductDto).includes('markirovka') &&
      Object.keys(updateProductDto).includes('markirovkaJson') &&
      Object.keys(updateProductDto).length == 2
    ) {
      console.log(updateProductDto);
      const markirovkaR2Link = await this.r2Service.uploadJson(
        uuidv4(),
        updateProductDto.markirovka,
      );
      const markirovkaJsonR2Link = await this.r2Service.uploadJson(
        uuidv4(),
        updateProductDto.markirovkaJson,
      );
      updateProductDto.markirovka = markirovkaR2Link;
      updateProductDto.markirovkaJson = markirovkaJsonR2Link;
    }

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
