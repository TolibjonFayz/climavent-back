import { Injectable, NotFoundException } from '@nestjs/common';
import Sequelize from 'sequelize';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Banner } from './model/banner.model';
import {
  CatalogScope,
  PUBLIC_SCOPE,
  visibleProductIdsSql,
} from 'src/common/visibility/catalog-visibility';

const { Op } = Sequelize;

@Injectable()
export class BannersService {
  constructor(
    @InjectModel(Banner) private readonly bannerRepository: typeof Banner,
  ) {}

  /**
   * `orderid` (eski) va `sort_order` (yangi) — bitta ma'no, ikkita nom.
   * Adminkaning eski versiyasi birinchisini, yangisi ikkinchisini yuboradi;
   * qaysi biri kelsa ham ikkalasi bir xil qiymatga tushadi, ya'ni saytdagi
   * tartib qaysi adminkadan yozilganiga bog'liq bo'lib qolmaydi.
   */
  private syncOrder<T extends { orderid?: number; sort_order?: number }>(dto: T): T {
    const payload: any = { ...dto };
    const berilgan = payload.sort_order ?? payload.orderid;
    if (berilgan !== undefined && berilgan !== null) {
      payload.sort_order = berilgan;
      payload.orderid = berilgan;
    }
    return payload;
  }

  //Create banner
  async createBanner(createBannerDto: CreateBannerDto) {
    const payload = this.syncOrder(createBannerDto);
    // `orderid` bazada NOT NULL, standart qiymatsiz
    if (payload.orderid === undefined || payload.orderid === null) {
      payload.orderid = 0;
      payload.sort_order = 0;
    }
    const newBaner = await this.bannerRepository.create(payload);

    const response = {
      message: 'Banner successfully created',
      newBaner,
    };
    return response;
  }

  /**
   * Bannerlar ro'yxati.
   *
   * MEHMON faqat faollarini ko'radi (topshiriq №19, 5-band): mavsumiy
   * bannerni o'chirmasdan yashirish mumkin bo'lsin. Adminka/bot hammasini
   * ko'radi — aks holda o'chirilgan bannerni qayta yoqib bo'lmasdi.
   */
  async getAllBanners(scope: CatalogScope = PUBLIC_SCOPE) {
    const banners = await this.bannerRepository.findAll({
      where: this.visibilityWhere(scope),
      include: { all: true },
      order: [
        ['sort_order', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    return banners;
  }

  //Get banner by id — nofaol banner to'g'ridan-to'g'ri havolada ham chiqmasin
  async getBannerById(id: number, scope: CatalogScope = PUBLIC_SCOPE) {
    const banner = await this.bannerRepository.findOne({
      where: { id: id, ...this.visibilityWhere(scope) },
      include: { all: true },
    });
    if (!banner) {
      throw new NotFoundException('Product not found or product id is invalid');
    }
    return banner;
  }

  /**
   * MEHMON faqat faol bannerni ko'radi va YASHIRIN MAHSULOTGA bog'langan
   * banner ham ko'rinmaydi (topshiriq №29, 1-band): e'lon qilinmagan do'kon
   * tovarining rasmi bosh sahifada turib, bosilganda 404 bo'lmasin.
   */
  private visibilityWhere(scope: CatalogScope): Record<string, any> {
    if (scope.kind === 'all') return {};
    const idsSql = visibleProductIdsSql(scope);
    return {
      is_active: true,
      [Op.or]: [
        { product_id: { [Op.is]: null } },
        { product_id: { [Op.in]: Sequelize.literal(idsSql) } },
      ],
    };
  }

  //Update banner by id
  async updateBannerById(id: number, updateBannerDto: UpdateBannerDto) {
    const updated = await this.bannerRepository.update(
      this.syncOrder(updateBannerDto),
      { where: { id: id }, returning: true },
    );
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else throw new NotFoundException('Banner not found or something wrong');
  }

  //Delete banner by id
  async deleteBannerById(id: number) {
    const deleting = await this.bannerRepository.destroy({
      where: { id: id },
    });
    if (deleting) return deleting;
    else throw new NotFoundException('Banner not found or something wrong');
  }
}
