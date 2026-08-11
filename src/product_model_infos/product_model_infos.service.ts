import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductModelInfoDto } from './dto/create-product_model_info.dto';
import { UpdateProductModelInfoDto } from './dto/update-product_model_info.dto';
import { InjectModel } from '@nestjs/sequelize';
import { ProductModelInfo } from './models/product_model_info.model';

@Injectable()
export class ProductModelInfosService {
  constructor(
    @InjectModel(ProductModelInfo)
    private readonly productModelInfoRepository: typeof ProductModelInfo,
  ) {}

  //Create product model info
  async createProductModelInfo(
    createProductModelInfoDto: CreateProductModelInfoDto,
  ) {
    const newProductModelInfo = await this.productModelInfoRepository.create(
      createProductModelInfoDto,
    );
    const response = {
      message: 'Product model info successfully created',
      newProductModelInfo,
    };
    return response;
  }

  //Get all product model infos (page/limit ixtiyoriy, standart 50 talik)
  async getAllProductModelInfos(page?: number, limit?: number) {
    const effectiveLimit = limit || 50;
    const effectivePage = page || 1;
    const offset = (effectivePage - 1) * effectiveLimit;
    return this.productModelInfoRepository.findAll({
      order: [['id', 'ASC']],
      limit: effectiveLimit,
      offset,
    });
  }

  //Get product model info by id
  async getProductModelInfoById(id: number) {
    const productModel = await this.productModelInfoRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (productModel) return productModel;
    else
      throw new NotFoundException(
        'Product model info not found or product id is invalid',
      );
  }

  //Update product model info by id
  async updateProductModelInfoById(
    id: number,
    updateProductModelInfoDto: UpdateProductModelInfoDto,
  ) {
    const existing = await this.productModelInfoRepository.findByPk(id);
    if (!existing) {
      throw new NotFoundException('Product model info not found or something wrong');
    }
    if (Object.keys(updateProductModelInfoDto).length === 0) {
      return existing.dataValues;
    }

    const updated = await this.productModelInfoRepository.update(
      updateProductModelInfoDto,
      {
        where: { id: id },
        returning: true,
      },
    );
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else
      throw new NotFoundException(
        'Product model info not found or something wrong',
      );
  }

  //Delete product model info by id
  async deleteProductModelInfoById(id: number) {
    const deleting = await this.productModelInfoRepository.destroy({
      where: { id: id },
    });
    if (deleting) return deleting;
    else
      throw new NotFoundException(
        'Product model info not found or something wrong',
      );
  }
}
