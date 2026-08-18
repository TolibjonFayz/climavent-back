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
import { ProductModels } from 'src/product_models/models/product_model.model';
import { Characteristic } from 'src/characteristics/model/characteristic.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';

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
    const text = searchProductsByQueryDto.text;
    // Har bir so'z alohida qidiriladi (barchasi mos kelishi kerak, lekin
    // turli maydonlarda bo'lishi mumkin) — shu orqali "kanal ventilyatori"
    // kabi ko'p so'zli so'rovlar ham topiladi.
    // O'zbekcha qo'shimchalarga (-i, -lar va h.k.) chidamli bo'lishi uchun
    // uzun so'zlarning oxiridagi 1-2 harfi kesiladi: "ventilyatori" ->
    // "ventilyato", bu esa "ventilyator" so'ziga ham mos keladi.
    const stem = (word: string) => {
      if (word.length > 5) return word.slice(0, -2);
      if (word.length > 3) return word.slice(0, -1);
      return word;
    };
    const words = text
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(stem);
    const wordConditions = words.map((word) => ({
      [Op.or]: [
        { name_uz: { [Op.iLike]: `%${word}%` } },
        { name_en: { [Op.iLike]: `%${word}%` } },
        { name_ru: { [Op.iLike]: `%${word}%` } },
        { '$models.name$': { [Op.iLike]: `%${word}%` } },
        { '$characters.title$': { [Op.iLike]: `%${word}%` } },
      ],
    }));
    const blogs = await this.productRepository.findAll({
      where: { [Op.and]: wordConditions },
      attributes: ['id', 'name_uz', 'name_en', 'name_ru'],
      include: [
        {
          model: ProductModels,
          as: 'models',
          attributes: ['id', 'name', 'price'],
          required: false,
        },
        {
          model: Characteristic,
          as: 'characters',
          attributes: ['id', 'title', 'price'],
          required: false,
        },
      ],
      subQuery: false,
    });
    // Topilmasa bo'sh massiv qaytaramiz (frontend uni .length === 0 bilan tekshiradi)
    return blogs;
  }

  //Get all products — page/limit ixtiyoriy, lekin standart chegara bor
  //(parametrsiz chaqiruv ham cheksiz javob qaytarmaydi)
  async getAllProducts(page?: number, limit?: number) {
    const effectiveLimit = limit || 20;
    const effectivePage = page || 1;
    const offset = (effectivePage - 1) * effectiveLimit;
    return this.productRepository.findAll({
      include: { all: true },
      order: [['id', 'ASC']],
      limit: effectiveLimit,
      offset,
    });
  }

  //Get all products FOR ADMIN
  async getAllProductsForAdmin() {
    const products = await this.productRepository.findAll({
      order: [['createdAt', 'DESC']],
      attributes: [
        'name_uz',
        'name_ru',
        'name_en',
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
  // 'Ommabop' -> views, 'kopbuyurtirilgan' -> sold_count
  // 'ASC'/'DESC' bu yerda hisoblanmaydi — narx endi product'da emas,
  // uning characteristics(models)'larida, shuning uchun JS darajasida sort qilinadi
  private buildOrder(price: string): any[] | null {
    if (price === 'Ommabop') return [['views', 'DESC']];
    if (price === 'kopbuyurtirilgan') return [['sold_count', 'DESC']];
    return null;
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

  //Get products by sort
  async getProductsBySort(searchProductDto: SortProductDto) {
    const offset = (searchProductDto.page - 1) * searchProductDto.limit;

    if (
      searchProductDto.price === 'ASC' ||
      searchProductDto.price === 'DESC'
    ) {
      const all = await this.productRepository.findAll({
        include: { all: true },
      });
      const sorted = this.sortByCharacteristicPrice(
        all,
        searchProductDto.price,
      );
      return sorted.slice(offset, offset + searchProductDto.limit);
    }

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

    if (
      sortbyCategoryIdProduct.price === 'ASC' ||
      sortbyCategoryIdProduct.price === 'DESC'
    ) {
      const all = await this.productRepository.findAll({
        where: { category_id: { [Op.in]: categoryIds } },
        include: { all: true },
      });
      const sorted = this.sortByCharacteristicPrice(
        all,
        sortbyCategoryIdProduct.price,
      );
      return sorted.slice(0, sortbyCategoryIdProduct.limit);
    }

    const order = this.buildOrder(sortbyCategoryIdProduct.price);
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
        // Narx (USD) characteristics'ning SAP variantlarida turadi.
        // { all: true } faqat 1-darajani oladi, shuning uchun bu
        // ichma-ich bog'lanish alohida ko'rsatilgan.
        {
          model: Characteristic,
          include: [{ model: ProductModelInside }],
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
    const existing = await this.productRepository.findByPk(id);
    if (!existing) {
      throw new NotFoundException('Product not found or something wrong');
    }

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

    if (Object.keys(updateProductDto).length === 0) {
      return existing.dataValues;
    }

    const updated = await this.productRepository.update(updateProductDto, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else throw new NotFoundException('Product not found or something wrong');
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
