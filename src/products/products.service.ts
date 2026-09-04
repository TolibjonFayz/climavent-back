import { SortbyCategoryIdProductDto } from 'src/category/dto/sortbycategoryid-product.dto';
import { GetRecentlyAddedProductsDto } from './dto/getlastadded-product.dto';
import { SearchProductsByQueryDto } from './dto/search-product.dto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Category } from 'src/category/model/category.model';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { SortProductDto } from './dto/sort-product.dto';
import { Review } from 'src/reviews/model/review.model';
import { User } from 'src/users/model/user.model';
import { InjectModel } from '@nestjs/sequelize';
import { Product } from './model/product.model';
import Sequelize, { where } from 'sequelize';
import { R2Service } from 'src/r2/r2.service';
import { Characteristic } from 'src/characteristics/model/characteristic.model';
import { Store } from 'src/stores/model/store.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';
import { OrderItem } from 'src/order_items/model/order_item.model';

const { Op } = Sequelize;
@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product) private readonly productRepository: typeof Product,
    @InjectModel(Category) private readonly categoryRepository: typeof Category,
    @InjectModel(OrderItem)
    private readonly orderItemRepository: typeof OrderItem,
    @InjectModel(Store) private readonly storeRepository: typeof Store,
    private r2Service: R2Service,
  ) {}

  //Create product
  async createProduct(createProductDto: CreateProductDto) {
    // Do'kon endi `store_id` orqali belgilanadi. `producer` matni hali
    // o'chirilmagan (eski mijozlar o'qiydi), shuning uchun berilmasa
    // `store.name` dan to'ldiramiz — ikki manba bir-biriga mos qoladi.
    const store = await this.storeRepository.findByPk(
      createProductDto.store_id,
    );
    if (!store) {
      throw new BadRequestException("Bunday do'kon yo'q (store_id)");
    }

    const newProduct = await this.productRepository.create({
      ...createProductDto,
      producer: createProductDto.producer?.trim() || store.name,
    } as any);

    return {
      message: 'Product successfully created',
      newProduct,
    };
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
        { '$characters.title$': { [Op.iLike]: `%${word}%` } },
      ],
    }));
    const blogs = await this.productRepository.findAll({
      where: { [Op.and]: wordConditions },
      attributes: ['id', 'name_uz', 'name_en', 'name_ru'],
      include: [
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
  //`storeId` berilsa faqat o'sha do'kon mahsulotlari qaytadi — marketplace
  //adminkasi hamma mahsulotni tortib, mijoz tomonda filtrlamasin.
  async getAllProducts(page?: number, limit?: number, storeId?: number) {
    const effectiveLimit = limit || 20;
    const effectivePage = page || 1;
    const offset = (effectivePage - 1) * effectiveLimit;
    return this.productRepository.findAll({
      ...(storeId ? { where: { store_id: storeId } } : {}),
      // Katalog kartochkalari narxni insides[].price dan oladi
      include: this.catalogInclude(),
      order: [['id', 'ASC']],
      limit: effectiveLimit,
      offset,
    });
  }

  //Get all products FOR ADMIN
  async getAllProductsForAdmin(storeId?: number) {
    const products = await this.productRepository.findAll({
      ...(storeId ? { where: { store_id: storeId } } : {}),
      order: [['createdAt', 'DESC']],
      // `producer` (do'kon kaliti sifatida ishlatilyapti) va `views`
      // adminka ro'yxati uchun kerak — ularsiz adminka to'liq
      // `products/all?limit=300` ni tortishga majbur bo'lardi.
      attributes: [
        'id',
        'name_uz',
        'name_ru',
        'name_en',
        'quantity',
        'description_short_uz',
        'producer',
        'views',
        // Ro'yxatda do'konni ko'rsatish uchun — ilgari faqat `producer`
        // matni bor edi va adminka do'konni undan taxmin qilardi.
        'store_id',
      ],
      include: [
        'category',
        { model: Store, attributes: ['id', 'name', 'slug'] },
      ],
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
      include: this.catalogInclude(),
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

  // Katalog kartochkalari uchun include — characters va ularning
  // SAP variantlari (insides). Narx insides[].price da (USD), shuning
  // uchun ro'yxatda narx ko'rsatish uchun bu nested bog'lanish kerak.
  // { all: true } faqat 1-darajani oladi, shuning uchun alohida yoziladi.
  private catalogInclude(): any[] {
    return [
      { model: Characteristic, include: [{ model: ProductModelInside }] },
      { all: true },
    ];
  }

  // Product'ning eng arzon SAP variant narxi (USD). Narx yo'q variantlar
  // (null) e'tiborga olinmaydi; hech qaysisida narx bo'lmasa Infinity
  // qaytadi — bunday mahsulotlar saralashda oxiriga tushadi.
  private getMinInsidePrice(product: Product): number {
    const prices: number[] = [];
    for (const c of product.characters || []) {
      for (const inside of (c as any).insides || []) {
        const p = Number(inside?.price);
        if (Number.isFinite(p) && p > 0) prices.push(p);
      }
    }
    return prices.length ? Math.min(...prices) : Infinity;
  }

  private sortByInsidePrice(products: Product[], direction: string) {
    return [...products].sort((a, b) => {
      const diff = this.getMinInsidePrice(a) - this.getMinInsidePrice(b);
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
        include: this.catalogInclude(),
      });
      const sorted = this.sortByInsidePrice(all, searchProductDto.price);
      return sorted.slice(offset, offset + searchProductDto.limit);
    }

    const order = this.buildOrder(searchProductDto.price);
    return this.productRepository.findAll({
      include: this.catalogInclude(),
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
        include: this.catalogInclude(),
      });
      const sorted = this.sortByInsidePrice(all, sortbyCategoryIdProduct.price);
      return sorted.slice(0, sortbyCategoryIdProduct.limit);
    }

    const order = this.buildOrder(sortbyCategoryIdProduct.price);
    return this.productRepository.findAll({
      where: { category_id: { [Op.in]: categoryIds } },
      include: this.catalogInclude(),
      ...(order ? { order } : {}),
      limit: sortbyCategoryIdProduct.limit,
    });
  }

  //Get product by id.
  //`countView=false` bo'lsa ko'rish hisoblagichi oshmaydi — admin/servis
  //o'qishlari mijoz tashrifi emas.
  async getProductById(id: number, countView = true) {
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
    // Ko'rish hisoblagichi.
    // `increment` — atomik (o'qib-yozish emas), shuning uchun bir vaqtda
    // kelgan so'rovlar bir-birini bosib ketmaydi.
    // `silent: true` — `updatedAt` ga TEGMAYDI. Ilgari oddiy `update()`
    // ishlatilgani uchun har bir TASHRIF `updatedAt` ni ko'tarib,
    // "oxirgi tahrir" vaqtini yaroqsiz qilardi.
    if (countView) {
      await this.productRepository.increment('views', {
        where: { id },
        silent: true,
      });
      // Javobda ham yangi qiymat ko'rinsin (increment obyektni yangilamaydi)
      product.views = product.views + 1;
    }
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
        this.r2Service.buildJsonKey(),
        updateProductDto.sizes,
      );
      const sizesJsonR2Link = await this.r2Service.uploadJson(
        this.r2Service.buildJsonKey(),
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
        this.r2Service.buildJsonKey(),
        updateProductDto.opisaniya,
      );
      const opisaniyaJsonR2Link = await this.r2Service.uploadJson(
        this.r2Service.buildJsonKey(),
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
        this.r2Service.buildJsonKey(),
        updateProductDto.naznacheniya,
      );
      const naznacheniyaJsonR2Link = await this.r2Service.uploadJson(
        this.r2Service.buildJsonKey(),
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
        this.r2Service.buildJsonKey(),
        updateProductDto.markirovka,
      );
      const markirovkaJsonR2Link = await this.r2Service.uploadJson(
        this.r2Service.buildJsonKey(),
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

  //Delete product by id.
  //Rasm/like/savat kabi bog'liq yozuvlar FK CASCADE bilan o'zi o'chadi
  //(migratsiya 20260903120000). Buyurtmalar esa SAVDO TARIXI — ular
  //bilan bog'langan mahsulotni o'chirishga YO'L QO'YILMAYDI, aks holda
  //daromad hisoboti buziladi. Bunday holatda aniq 409 qaytaramiz.
  async deleteProductById(id: number) {
    const existing = await this.productRepository.findByPk(id, {
      attributes: ['id'],
    });
    if (!existing) {
      throw new NotFoundException('Product not found or something wrong');
    }

    const orderedCount = await this.orderItemRepository.count({
      where: { product_id: id },
    });
    if (orderedCount > 0) {
      throw new ConflictException(
        `Bu mahsulot ${orderedCount} ta buyurtmada qatnashgan — o'chirib ` +
          "bo'lmaydi, aks holda savdo tarixi yo'qoladi. Sotuvdan olib " +
          "qo'yish uchun miqdorini 0 qiling.",
      );
    }

    return this.productRepository.destroy({ where: { id } });
  }
}
