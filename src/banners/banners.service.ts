import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Banner } from './model/banner.model';

@Injectable()
export class BannersService {
  constructor(
    @InjectModel(Banner) private readonly bannerRepository: typeof Banner,
  ) {}

  //Create banner
  async createBanner(createBannerDto: CreateBannerDto) {
    const newBaner = await this.bannerRepository.create(createBannerDto);
    const response = {
      message: 'Banner successfully created',
      newBaner,
    };
    return response;
  }

  //Get all banners
  async getAllBanners() {
    const banners = await this.bannerRepository.findAll({
      include: { all: true },
    });
    return banners;
  }

  //Get banner by id
  async getBannerById(id: number) {
    const banner = await this.bannerRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (banner) return banner;
    else
      throw new NotFoundException('Product not found or product id is invalid');
  }

  //Update banner by id
  async updateBannerById(id: number, updateBannerDto: UpdateBannerDto) {
    const updated = await this.bannerRepository.update(updateBannerDto, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else return new NotFoundException('Banner not found or something wrong');
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
