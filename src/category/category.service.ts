import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Op } from 'sequelize';
import { sortPriceUzs } from 'src/common/pricing/sale';
import { currentUsdRate } from 'src/common/pricing/currency';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Product } from 'src/products/model/product.model';
import { Category } from './model/category.model';
import { InjectModel } from '@nestjs/sequelize';
import { SortbyCategoryIdProductDto } from './dto/sortbycategoryid-product.dto';
import {
  CatalogScope,
  PUBLIC_SCOPE,
  productVisibilityWhere,
} from 'src/common/visibility/catalog-visibility';

@Injectable()
export class CategoryService {
  constructor(
    @InjectModel(Category) private readonly categoryRepository: typeof Category,
    @InjectModel(Product) private readonly productRepository: typeof Product,
  ) {}

  //Create category
  async createCategory(createCategoryDto: CreateCategoryDto) {
    await this.assertParentValid(createCategoryDto.category_id ?? null, null);
    const newCategory = await this.categoryRepository.create(createCategoryDto as any);
    const response = {
      message: 'Category successfully created',
      newCategory,
    };
    return response;
  }

  /**
   * OTA KATEGORIYA TEKSHIRUVI (topshiriq №29, 5-band).
   *
   * Prod'da #34 va #35 ning `category_id` si O'Z id siga teng edi: daraxt
   * quradigan kod (mobil ilova, sayt menyusi) bunday yozuvda cheksiz
   * aylanib qolishi mumkin. Ma'lumot migratsiyada tozalanadi
   * (`20260922100000-topshiriq-29.js`), bu yerda esa qayta paydo bo'lishi
   * to'siladi:
   *
   *   - o'zini o'ziga ota qilish        -> 400
   *   - mavjud bo'lmagan otaga ulash    -> 400
   *   - halqa (ota zanjiri o'ziga qaytsa) -> 400
   */
  private async assertParentValid(parentId: number | null, selfId: number | null) {
    if (parentId === null || parentId === undefined) return;
    if (selfId !== null && Number(parentId) === Number(selfId)) {
      throw new BadRequestException(
        "Kategoriya o'ziga ota bo'la olmaydi (category_id = id)",
      );
    }
    const parent = await this.categoryRepository.findByPk(parentId, {
      attributes: ['id', 'category_id'],
    });
    if (!parent) {
      throw new BadRequestException("Bunday ota kategoriya yo'q (category_id)");
    }
    if (selfId === null) return;
    // Halqa: otaning otasi ... o'zimizga qaytmasligi kerak.
    const korilgan = new Set<number>([Number(selfId)]);
    let current: { id: number; category_id: number | null } | null = parent as any;
    while (current && current.category_id !== null && current.category_id !== undefined) {
      if (korilgan.has(Number(current.category_id))) {
        throw new BadRequestException(
          "Kategoriyalar halqasi hosil bo'ladi (category_id)",
        );
      }
      korilgan.add(Number(current.id));
      current = (await this.categoryRepository.findByPk(current.category_id, {
        attributes: ['id', 'category_id'],
      })) as any;
    }
  }

  //Get all categories
  async getAllCategories() {
    const categories = await this.categoryRepository.findAll({
      include: { all: true },
    });
    return categories;
  }

  /**
   * Kategoriya bo'yicha mahsulotlar (sayt `POST /category/slug`).
   *
   * KO'RINUVCHANLIK (topshiriq №29, 1-band): bu endpoint ilgari HECH QANDAY
   * filtrsiz ishlardi — e'lon qilinmagan do'konning va o'chirib qo'yilgan
   * mahsulotning nomi/narxi MEHMONGA ham ko'rinardi (`products/categoryslug`
   * da filtr bor edi, bu yerda esa yo'q).
   *
   * Bola kategoriyalar ham hisobga olinadi: ilgari ota kategoriyaning O'Z
   * mahsulotlari bolalari bo'lsa ro'yxatdan butunlay tushib qolardi.
   */
  async sortProductsByCategoryId(
    sortbyCategoryIdProduct: SortbyCategoryIdProductDto,
    scope: CatalogScope = PUBLIC_SCOPE,
  ) {
    const children = await this.categoryRepository.findAll({
      where: { category_id: sortbyCategoryIdProduct.category_id },
      attributes: ['id'],
    });
    const categoryIds = [
      sortbyCategoryIdProduct.category_id,
      ...children.map((c) => c.id),
    ];

    const products = await this.productRepository.findAll({
      where: {
        category_id: { [Op.in]: categoryIds },
        ...productVisibilityWhere(scope),
      },
      include: { all: true },
      ...(sortbyCategoryIdProduct.limit ? { limit: sortbyCategoryIdProduct.limit } : {}),
    });

    if (
      sortbyCategoryIdProduct.price === 'Ommabop' ||
      sortbyCategoryIdProduct.price === 'kopbuyurtirilgan'
    ) {
      return products;
    }
    // Narx product'da emas, uning characteristics'larida — shuning uchun
    // saralash JS darajasida.
    return this.sortByCharacteristicPrice(products, sortbyCategoryIdProduct.price);
  }

  // Narx bo'yicha saralash — `products/bysort` dagi bilan bir xil qoida:
  // amaldagi eng arzon narx, SO'MDA taqqoslanadi (topshiriq №37 — USD va UZS
  // mahsulotlar aralash), narxsizlar har ikki yo'nalishda OXIRIDA.
  private async sortByCharacteristicPrice(products: Product[], direction: string) {
    const now = Date.now();
    const rate = await currentUsdRate(this.productRepository.sequelize);
    const keyed = products.map((p) => ({ p, k: sortPriceUzs(p as any, rate, now) }));
    keyed.sort((a, b) => {
      if (a.k === Infinity || b.k === Infinity) return a.k === b.k ? 0 : a.k === Infinity ? 1 : -1;
      return direction === 'ASC' ? a.k - b.k : b.k - a.k;
    });
    return keyed.map((x) => x.p);
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
    if ('category_id' in updateCategoryDto) {
      await this.assertParentValid(updateCategoryDto.category_id ?? null, id);
    }
    const updated = await this.categoryRepository.update(updateCategoryDto as any, {
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
