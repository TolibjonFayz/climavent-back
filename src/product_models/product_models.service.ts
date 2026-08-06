import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductModelDto } from './dto/create-product_model.dto';
import { UpdateProductModelDto } from './dto/update-product_model.dto';
import { BulkPriceItemDto } from './dto/bulk-price.dto';
import { InjectModel } from '@nestjs/sequelize';
import { ProductModels } from './models/product_model.model';
import { normalizeModelName } from 'src/common/helpers/normalize-model-name';
import { Op } from 'sequelize';

@Injectable()
export class ProductModelsService {
  constructor(
    @InjectModel(ProductModels)
    private readonly productModelRepository: typeof ProductModels,
  ) {}

  //Create product model
  async createProductModel(createProductModelDto: CreateProductModelDto) {
    try {
      const newProductModel = await this.productModelRepository.create(
        createProductModelDto,
      );
      const response = {
        message: 'Product model successfully created',
        newProductModel,
      };
      ``;
      return response;
    } catch (error) {
      console.log(error);
      return error;
    }
  }

  //Get all product models (updatedAfter ixtiyoriy — inkremental sinxronizatsiya uchun)
  async getAllProductModels(updatedAfter?: string) {
    const where = updatedAfter
      ? { updatedAt: { [Op.gt]: new Date(updatedAfter) } }
      : {};
    const productModels = await this.productModelRepository.findAll({
      where,
    });
    return productModels;
  }

  //Get product model by id
  async getProductModelById(id: number) {
    const productModel = await this.productModelRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (productModel) return productModel;
    else
      throw new NotFoundException(
        'Product model not found or product id is invalid',
      );
  }

  //Get product model by id
  async getProductModelByProductId(id: number) {
    const productModel = await this.productModelRepository.findOne({
      where: { product_id: id },
      include: { all: true },
    });
    return productModel;
  }

  //Get product model by slot
  async getProductModelBySlot(slot: string) {
    const productModel = await this.productModelRepository.findOne({
      where: { name: slot },
      include: { all: true },
    });

    if (productModel) return productModel;
    else
      throw new NotFoundException('Product model not found or slot is invalid');
  }

  //Update product model by id
  async updateProductModelById(
    id: number,
    updateProductModelDto: UpdateProductModelDto,
  ) {
    const existing = await this.productModelRepository.findByPk(id);
    if (!existing) {
      throw new NotFoundException(
        'Product model not found or something wrong',
      );
    }

    if (Object.keys(updateProductModelDto).length === 0) {
      return existing.dataValues;
    }

    const payload: Record<string, unknown> = { ...updateProductModelDto };
    if (payload.price !== undefined) {
      payload.price_updated_at = new Date();
    }

    const updated = await this.productModelRepository.update(payload, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else
      throw new NotFoundException(
        'Product model not found or something wrong',
      );
  }

  //Delete product model by id
  async deleteProductModelById(id: number) {
    const deleting = await this.productModelRepository.destroy({
      where: { id: id },
    });
    if (deleting) return deleting;
    else
      throw new NotFoundException('Product model not found or something wrong');
  }

  // Narxlarni ommaviy yuklash — model nomi normallashtirilib topiladi
  // (bo'sh joy, "-", "/", "_", "." e'tiborga olinmaydi).
  async bulkUpdatePrices(items: BulkPriceItemDto[]) {
    const allModels = await this.productModelRepository.findAll({
      attributes: ['id', 'name'],
    });
    const byNormalizedName = new Map<string, number[]>();
    for (const m of allModels) {
      const key = normalizeModelName(m.name);
      if (!byNormalizedName.has(key)) byNormalizedName.set(key, []);
      byNormalizedName.get(key).push(m.id);
    }

    let updated = 0;
    const notFound: string[] = [];
    const ambiguous: { name: string; matchedIds: number[] }[] = [];
    const now = new Date();

    for (const item of items) {
      const ids = byNormalizedName.get(normalizeModelName(item.name));
      if (!ids || ids.length === 0) {
        notFound.push(item.name);
        continue;
      }
      if (ids.length > 1) {
        ambiguous.push({ name: item.name, matchedIds: ids });
        continue;
      }
      await this.productModelRepository.update(
        {
          price: item.price,
          currency: item.currency || 'UZS',
          price_updated_at: now,
        },
        { where: { id: ids[0] } },
      );
      updated++;
    }

    return { total: items.length, updated, notFound, ambiguous };
  }
}
