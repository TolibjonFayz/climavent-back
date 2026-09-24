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
import { ProductImages } from 'src/product_images/model/product_image.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';
import { OrderItem } from 'src/order_items/model/order_item.model';
import { ON_SALE_PRODUCT_IDS_SQL, sortPriceUzs } from 'src/common/pricing/sale';
import { currentUsdRate, isCurrency } from 'src/common/pricing/currency';
import {
  CatalogScope,
  PUBLIC_SCOPE,
  productVisibilityWhere,
} from 'src/common/visibility/catalog-visibility';
import { searchVariants } from 'src/common/helpers/translit';

const SALE_ATTRS = ['sale_price', 'sale_starts_at', 'sale_ends_at'];

const { Op } = Sequelize;
/** `?view=card` — mahsulotning o'z maydonlari (topshiriq №23). */
const CARD_PRODUCT_ATTRIBUTES = [
  'id',
  'name_uz',
  'name_ru',
  'name_en',
  'category_id',
  'store_id',
  'producer',
  'quantity',
  'is_active',
  'currency',
  'createdAt',
  'updatedAt',
];

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
      // Topshiriq №37: berilmasa do'konning standart valyutasi
      currency: isCurrency(createProductDto.currency) ? createProductDto.currency : store.default_currency || 'USD',
    } as any);

    return {
      message: 'Product successfully created',
      newProduct,
    };
  }

  /**
   * QIDIRUV (topshiriq №29, 2-band).
   *
   * Qamrov: `name_uz`, `name_ru`, `name_en`, model nomi
   * (`characteristics.title`) va SAP varianti (`product-model-inside`.
   * `sap_name`, `in_model_name`). Katta-kichik harf ahamiyatsiz (`ILIKE`).
   *
   * Har so'z uchun kirill/lotin variantlari ham qidiriladi
   * (`common/helpers/translit.ts`): "вент" lotincha yozilgan nomni ham,
   * "vts" esa "ВЦ" ni ham topadi.
   *
   * Har so'z ALOHIDA `EXISTS` bo'lib tekshiriladi: "kanal ventilyatori"
   * kabi so'rovda so'zlar turli maydonlarda (hatto turli variantlarda)
   * bo'lishi mumkin. Ilgari hamma shart BITTA birlashtirilgan qatorga
   * tushishi kerak edi.
   *
   * SQL `literal` bilan yoziladi (Sequelize ning `$nested.field$` yozuvi
   * ikki darajali `include` da ishonchsiz), lekin har bir qiymat
   * `sequelize.escape()` dan o'tadi — foydalanuvchi matni SQL ga
   * aralashmaydi. `%`/`_` belgilari ham zararsizlantiriladi, aks holda
   * bitta `%` butun katalogni qaytarardi.
   */
  async searchProducts(
    searchProductsByQueryDto: SearchProductsByQueryDto,
    scope: CatalogScope = PUBLIC_SCOPE,
  ) {
    const raw = String(searchProductsByQueryDto.text ?? '').slice(0, 100);
    // O'zbekcha qo'shimchalarga (-i, -lar va h.k.) chidamli bo'lishi uchun
    // uzun so'zlarning oxiridagi 1-2 harfi kesiladi: "ventilyatori" ->
    // "ventilyato", bu esa "ventilyator" so'ziga ham mos keladi.
    const stem = (word: string) => {
      if (word.length > 5) return word.slice(0, -2);
      if (word.length > 3) return word.slice(0, -1);
      return word;
    };
    const words = raw
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6);
    if (!words.length) return [];

    const sq = this.productRepository.sequelize;
    const like = (column: string, value: string) => {
      // `%` va `_` — ILIKE ning shablon belgilari; qidiruv matnida ular
      // oddiy belgi bo'lishi kerak.
      const safe = value.replace(/([\\%_])/g, '\\$1');
      return `${column} ILIKE ${sq.escape(`%${safe}%`)}`;
    };

    const wordSql = words.map((word) => {
      const variants = searchVariants(word).map(stem);
      const any = (column: string) => variants.map((v) => like(column, v)).join(' OR ');
      return `(
        ${any('p.name_uz')} OR ${any('p.name_ru')} OR ${any('p.name_en')}
        OR EXISTS (
          SELECT 1 FROM characteristics c
           WHERE c.product_id = p.id
             AND (
               ${any('c.title')}
               OR EXISTS (
                 SELECT 1 FROM "product-model-inside" i
                  WHERE i.product_model_id = c.id
                    AND (${any('i.sap_name')} OR ${any('i.in_model_name')})
               )
             )
        )
      )`;
    });

    const idsSql = `(SELECT p.id FROM products p WHERE ${wordSql.join(' AND ')})`;

    const blogs = await this.productRepository.findAll({
      where: {
        id: { [Op.in]: Sequelize.literal(idsSql) },
        // Ko'rinuvchanlik qidiruvda ham bir xil (1-band): xaridor tokeni
        // yashirin do'kon tovarini qidiruvdan ham topmaydi.
        ...productVisibilityWhere(scope),
      },
      attributes: ['id', 'name_uz', 'name_en', 'name_ru', 'currency'],
      include: [
        {
          model: Characteristic,
          as: 'characters',
          attributes: ['id', 'title', 'price', 'currency', ...SALE_ATTRS],
          required: false,
          // Narx SAP variantlarida — qidiruv ro'yxatida ham "dan"
          // narxini va aksiyani (№15) ko'rsatish uchun kerak.
          include: [{ model: ProductModelInside, attributes: ['price', 'currency', ...SALE_ATTRS] }],
        },
        // Qidiruv ro'yxatida rasm va do'kon nomi ko'rsatiladi — faqat
        // matnli ro'yxat foydalanuvchiga kam narsa aytadi.
        { model: ProductImages, as: 'images', attributes: ['image_link'] },
        { model: Store, attributes: ['id', 'name', 'slug'] },
      ],
      order: [['id', 'ASC']],
      // DIQQAT: `subQuery: false` BO'LMASLIGI kerak. `hasMany` include
      // bilan birga bo'lsa LIMIT birlashtirilgan QATORLARGA qo'llanadi va
      // 100 qator 10 ta mahsulotga yig'ilib qoladi. Standart (subquery)
      // rejimida limit mahsulotlarga tushadi.
      limit: 100,
    });
    // Topilmasa bo'sh massiv qaytaramiz (frontend uni .length === 0 bilan tekshiradi)
    return blogs;
  }

  //Get all products — page/limit ixtiyoriy, lekin standart chegara bor
  //(parametrsiz chaqiruv ham cheksiz javob qaytarmaydi)
  //`storeId` berilsa faqat o'sha do'kon mahsulotlari qaytadi — marketplace
  //adminkasi hamma mahsulotni tortib, mijoz tomonda filtrlamasin.
  async getAllProducts(
    page?: number,
    limit?: number,
    storeId?: number,
    scope: CatalogScope = PUBLIC_SCOPE,
    onSale = false,
    view: 'full' | 'card' = 'full',
  ) {
    const effectiveLimit = limit || 20;
    const effectivePage = page || 1;
    const offset = (effectivePage - 1) * effectiveLimit;
    return this.productRepository.findAll({
      where: {
        ...this.visibilityWhere(scope),
        ...(storeId ? { store_id: storeId } : {}),
        ...this.saleWhere(onSale),
      },
      // Katalog kartochkalari narxni insides[].price dan oladi
      ...(view === 'card'
        ? { attributes: CARD_PRODUCT_ATTRIBUTES, include: this.cardInclude() }
        : { include: this.catalogInclude() }),
      order: [['id', 'ASC']],
      limit: effectiveLimit,
      offset,
    });
  }

  //Get all products FOR ADMIN
  async getAllProductsForAdmin(storeId?: number, scope: CatalogScope = PUBLIC_SCOPE) {
    const products = await this.productRepository.findAll({
      // Bu endpoint TOKENSIZ ham ochiq (sitemap shundan o'qiydi), shuning
      // uchun ro'yxat ham ko'rinuvchanlik doirasidan o'tadi: mehmonga
      // e'lon qilinmagan do'konning tovar nomlari ham chiqmasin
      // (topshiriq №29, 1-band).
      where: {
        ...productVisibilityWhere(scope),
        ...(storeId ? { store_id: storeId } : {}),
      },
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
        // Analitika hisoblagichlari (topshiriq №11, 2-band). Bularsiz
        // adminka savat/layk/sharh sonini bilish uchun butun
        // `cart-items` va `likes` jadvallarini tortib, o'zi sanashi
        // kerak bo'lardi.
        'sold_count',
        'cart_count',
        'likes_count',
        'reviews_count',
        // Ro'yxatda do'konni ko'rsatish uchun — ilgari faqat `producer`
        // matni bor edi va adminka do'konni undan taxmin qilardi.
        'store_id',
        // Tez narx kiritish mahsulot valyutasida (№37)
        'currency',
      ],
      include: [
        'category',
        { model: Store, attributes: ['id', 'name', 'slug'] },
      ],
    });
    return products;
  }

  //Get all products count
  // Sahifalash shu songa tayanadi, shuning uchun u ham FILTRDAN
  // KEYINGI son bo'lishi kerak — aks holda sayt "177 ta" deb yozib,
  // 137 tasini ko'rsatardi (topshiriq №14, 1-band, 3-qadam).
  async getAllProductsCount(scope: CatalogScope = PUBLIC_SCOPE, onSale = false) {
    const products = await this.productRepository.count({
      where: { ...this.visibilityWhere(scope), ...this.saleWhere(onSale) },
    });
    return products;
  }

  //Get recently added products
  async getRecentlyAddedProducts(
    getRecentlyAddedProductsDto: GetRecentlyAddedProductsDto,
    scope: CatalogScope = PUBLIC_SCOPE,
  ) {
    const offset =
      (getRecentlyAddedProductsDto.page - 1) *
      getRecentlyAddedProductsDto.limit;
    const onSale = getRecentlyAddedProductsDto.on_sale === true;
    const count = await this.getAllProductsCount(scope, onSale);

    const products = await this.productRepository.findAll({
      where: { ...this.visibilityWhere(scope), ...this.saleWhere(onSale) },
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

  // KO'RINUVCHANLIK FILTRI (topshiriq №14, 1- va 6-bandlar).
  //
  // Mehmon (sayt) faqat quyidagilarni ko'radi:
  //   - do'koni FAOL (`stores.is_active = true`)
  //   - mahsulotning O'ZI faol (`products.is_active = true`)
  //
  // Adminka/bot (`privileged`) esa hammasini ko'radi — nofaol do'kon
  // mahsulotini tahrirlab turishi kerak.
  //
  // Do'kon shartida `literal` subquery ishlatilgan: alohida so'rov
  // qilinmaydi, hamma narsa bitta SQL da hal bo'ladi.
  //
  // Qoidalar yagona joyda: `common/visibility/catalog-visibility.ts`
  // (topshiriq №29, 1-band). Do'kon admini O'Z do'konining hammasini,
  // boshqalarning esa faqat ommaviy tovarini ko'radi; sayt admini va
  // xaridor tokeni — mehmon bilan bir xil.
  private visibilityWhere(scope: CatalogScope): Record<string, any> {
    return productVisibilityWhere(scope);
  }

  // `on_sale=true` filtri (topshiriq №15, 6-band): kamida bitta varianti
  // (yoki variantsiz modeli) FAOL aksiyada. Shart `common/pricing/sale.ts`
  // dagi `isSaleActive` bilan aynan bir xil.
  private saleWhere(onSale: boolean): Record<string, any> {
    if (!onSale) return {};
    return { id: { [Op.in]: Sequelize.literal(ON_SALE_PRODUCT_IDS_SQL) } };
  }

  // Katalog kartochkalari uchun include — characters va ularning
  // SAP variantlari (insides). Narx insides[].price da (USD), shuning
  // uchun ro'yxatda narx ko'rsatish uchun bu nested bog'lanish kerak.
  // { all: true } faqat 1-darajani oladi, shuning uchun alohida yoziladi.
  /**
   * Yengil ro'yxat (`?view=card`, topshiriq №23): kartochka va ro'yxat sahifasi
   * uchun kerakli maydonlargina. To'liq variantda har mahsulotda do'konning
   * butun profili (uch tildagi tavsifi bilan ~2 KB), modellarning tavsif fayl
   * havolalari, sharhlarning matni takrorlanadi — 500 ta mahsulotda 1,3 MB.
   *
   * Aksiya maydonlari (`sale_*`) ATAYLAB bor: `on_sale`, `min_price`,
   * `min_sale_price` ni global interceptor shulardan hisoblaydi.
   */
  private cardInclude(): any[] {
    const sale = ['price', 'currency', 'sale_price', 'sale_starts_at', 'sale_ends_at'];
    return [
      {
        model: Characteristic,
        attributes: ['id', 'title', 'product_id', ...sale],
        include: [{ model: ProductModelInside, attributes: ['id', 'product_model_id', ...sale] }],
      },
      { model: Store, attributes: ['id', 'name', 'slug', 'logo_url', 'phone', 'telegram', 'is_active'] },
      { model: Category, attributes: ['id', 'name_uz', 'name_ru', 'name_en', 'category_id'] },
      { model: ProductImages, attributes: ['id', 'image_link', 'product_id'] },
      { model: Review, attributes: ['id', 'stars', 'product_id'] },
    ];
  }

  private catalogInclude(): any[] {
    return [
      { model: Characteristic, include: [{ model: ProductModelInside }] },
      { all: true },
    ];
  }

  // Narx bo'yicha saralash — AMALDAGI narx bilan (topshiriq №15, 6-band):
  // aksiyadagi mahsulot "arzondan qimmatga" ro'yxatida aksiya narxi o'rnida
  // turadi. Narx qoidasi kartadagidek (variant, bo'lmasa model). Narxsiz
  // mahsulotlar har ikki yo'nalishda ham OXIRIDA.
  //
  // Taqqoslash SO'MDA (topshiriq №37): USD va UZS mahsulotlar aralash turadi.
  private async sortByPrice(products: Product[], direction: string) {
    const now = Date.now();
    const rate = await currentUsdRate(this.productRepository.sequelize);
    const keyed = products.map((p) => ({ p, k: sortPriceUzs(p as any, rate, now) }));
    keyed.sort((a, b) => {
      if (a.k === Infinity || b.k === Infinity) {
        return a.k === b.k ? 0 : a.k === Infinity ? 1 : -1;
      }
      return direction === 'ASC' ? a.k - b.k : b.k - a.k;
    });
    return keyed.map((x) => x.p);
  }

  //Get products by sort
  async getProductsBySort(searchProductDto: SortProductDto, scope: CatalogScope = PUBLIC_SCOPE) {
    const offset = (searchProductDto.page - 1) * searchProductDto.limit;
    const where = {
      ...this.visibilityWhere(scope),
      ...this.saleWhere(searchProductDto.on_sale === true),
    };

    if (
      searchProductDto.price === 'ASC' ||
      searchProductDto.price === 'DESC'
    ) {
      const all = await this.productRepository.findAll({
        where,
        include: this.catalogInclude(),
      });
      const sorted = await this.sortByPrice(all, searchProductDto.price);
      return sorted.slice(offset, offset + searchProductDto.limit);
    }

    const order = this.buildOrder(searchProductDto.price);
    return this.productRepository.findAll({
      where,
      include: this.catalogInclude(),
      ...(order ? { order } : {}),
      limit: searchProductDto.limit,
      offset,
    });
  }

  //Get products by category (+ bola kategoriyalar) — bitta query, DB darajasida sort
  async sortProductsByCategoryId(
    sortbyCategoryIdProduct: SortbyCategoryIdProductDto,
    scope: CatalogScope = PUBLIC_SCOPE,
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
        where: {
          category_id: { [Op.in]: categoryIds },
          ...this.visibilityWhere(scope),
          ...this.saleWhere(sortbyCategoryIdProduct.on_sale === true),
        },
        include: this.catalogInclude(),
      });
      const sorted = await this.sortByPrice(all, sortbyCategoryIdProduct.price);
      return sorted.slice(0, sortbyCategoryIdProduct.limit);
    }

    const order = this.buildOrder(sortbyCategoryIdProduct.price);
    return this.productRepository.findAll({
      where: {
        category_id: { [Op.in]: categoryIds },
        ...this.visibilityWhere(scope),
        ...this.saleWhere(sortbyCategoryIdProduct.on_sale === true),
      },
      include: this.catalogInclude(),
      ...(order ? { order } : {}),
      limit: sortbyCategoryIdProduct.limit,
    });
  }

  //Get product by id.
  //`countView=false` bo'lsa ko'rish hisoblagichi oshmaydi — admin/servis
  //o'qishlari mijoz tashrifi emas.
  async getProductById(id: number, countView = true, scope: CatalogScope = PUBLIC_SCOPE) {
    const product = await this.productRepository.findOne({
      // Nofaol do'kon mahsulotiga TO'G'RIDAN-TO'G'RI havola ham
      // ochilmasin (topshiriq №14, 1-band, 2-qadam): odamlarda eski
      // havola saqlanib qolgan bo'lishi mumkin. Filtr `where` ichida —
      // shuning uchun natija topilmaydi va quyida 404 beriladi.
      where: { id: id, ...this.visibilityWhere(scope) },
      include: [
        {
          // Yashirilgan sharhlar saytda ko'rinmaydi (topshiriq №14,
          // 3-band). Adminka sharhlarni `reviews/*` orqali o'qiydi,
          // u yerda hammasi qaytadi.
          model: Review,
          required: false,
          ...(scope.kind === 'public' ? { where: { is_hidden: false } } : {}),
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
  async updateProductById(id: number, updateProductDto: UpdateProductDto): Promise<Record<string, any>> {
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
    if (!updated[1][0]?.dataValues) throw new NotFoundException('Product not found or something wrong');

    // Valyuta almashdi (topshiriq №37): narxlar AYLANTIRILMAYDI — sotuvchi
    // qayta yozadi. Modellar/variantlar valyutasini trigger yangiladi;
    // adminka ogohlantirishi uchun qayta ko'rilishi kerak bo'lgan narxlar soni.
    if (updateProductDto.currency && updateProductDto.currency !== existing.currency) {
      const [row]: any[] = await this.productRepository.sequelize.query(
        `SELECT (SELECT count(*) FROM characteristics c WHERE c.product_id = :id AND c.price > 0)
              + (SELECT count(*) FROM "product-model-inside" i JOIN characteristics c ON c.id = i.product_model_id
                  WHERE c.product_id = :id AND i.price > 0) AS n`,
        { replacements: { id }, type: Sequelize.QueryTypes.SELECT },
      );
      return {
        ...updated[1][0].dataValues,
        currency_changed: { from: existing.currency, to: updateProductDto.currency },
        prices_to_review: Number(row?.n || 0),
      };
    }
    return updated[1][0].dataValues;
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
