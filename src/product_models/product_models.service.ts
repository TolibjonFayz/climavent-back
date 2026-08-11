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

  // Get all product models
  // - updatedAfter: inkremental sinxronizatsiya — shu vaqtdan keyin
  //   o'zgarganlar.
  // - airflowMin/airflowMax: havo sarfi bo'yicha filtr (masalan mos
  //   ventilyatorni tanlash uchun).
  // - page/limit: berilsa shu bo'yicha sahifalanadi.
  // - filtr (updatedAfter yoki airflow) berilib, page/limit berilmasa:
  //   standart limit qo'llanmaydi (natija ro'yxati odatda o'zi ham kichik
  //   bo'ladi). Hech qanday filtr/sahifalash berilmasa: standart 50 talik
  //   (1482 tani bir yo'la yubormaslik uchun).
  async getAllProductModels(
    updatedAfter?: string,
    page?: number,
    limit?: number,
    airflowMin?: number,
    airflowMax?: number,
  ) {
    const where: Record<string, unknown> = {};
    if (updatedAfter) {
      where.updatedAt = { [Op.gt]: new Date(updatedAfter) };
    }
    if (airflowMin !== undefined || airflowMax !== undefined) {
      where.airflow_m3h = {
        ...(airflowMin !== undefined ? { [Op.gte]: airflowMin } : {}),
        ...(airflowMax !== undefined ? { [Op.lte]: airflowMax } : {}),
      };
    }

    const hasFilter = Boolean(updatedAfter || airflowMin !== undefined || airflowMax !== undefined);
    if (hasFilter && !page && !limit) {
      return this.productModelRepository.findAll({ where, order: [['id', 'ASC']] });
    }

    const effectiveLimit = limit || 50;
    const effectivePage = page || 1;
    const offset = (effectivePage - 1) * effectiveLimit;
    return this.productModelRepository.findAll({
      where,
      order: [['id', 'ASC']],
      limit: effectiveLimit,
      offset,
    });
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

  // Narxlarni ommaviy yuklash — avval sap_name, topilmasa name bo'yicha,
  // ikkalasi ham normallashtirilib solishtiriladi (bo'sh joy, "-", "/",
  // "_", "." e'tiborga olinmaydi).
  async bulkUpdatePrices(items: BulkPriceItemDto[]) {
    const allModels = await this.productModelRepository.findAll({
      attributes: ['id', 'name', 'sap_name'],
    });
    const byNormalizedName = new Map<string, number[]>();
    const byNormalizedSapName = new Map<string, number[]>();
    for (const m of allModels) {
      const nameKey = normalizeModelName(m.name);
      if (!byNormalizedName.has(nameKey)) byNormalizedName.set(nameKey, []);
      byNormalizedName.get(nameKey).push(m.id);

      if (m.sap_name) {
        const sapKey = normalizeModelName(m.sap_name);
        if (!byNormalizedSapName.has(sapKey)) byNormalizedSapName.set(sapKey, []);
        byNormalizedSapName.get(sapKey).push(m.id);
      }
    }

    let updated = 0;
    const notFound: string[] = [];
    const ambiguous: { identifier: string; matchedIds: number[] }[] = [];
    const invalid: { item: BulkPriceItemDto; reason: string }[] = [];
    const now = new Date();

    for (const item of items) {
      const identifier = item.sap_name || item.name;
      if (!identifier) {
        invalid.push({ item, reason: "name yoki sap_name berilishi shart" });
        continue;
      }

      let ids: number[] | undefined;
      if (item.sap_name) {
        ids = byNormalizedSapName.get(normalizeModelName(item.sap_name));
      }
      if ((!ids || ids.length === 0) && item.name) {
        ids = byNormalizedName.get(normalizeModelName(item.name));
      }

      if (!ids || ids.length === 0) {
        notFound.push(identifier);
        continue;
      }
      if (ids.length > 1) {
        ambiguous.push({ identifier, matchedIds: ids });
        continue;
      }

      await this.productModelRepository.update(
        {
          price: item.price,
          currency: item.currency || 'UZS',
          price_updated_at: now,
          ...(item.price_valid_until
            ? { price_valid_until: new Date(item.price_valid_until) }
            : {}),
        },
        { where: { id: ids[0] } },
      );
      updated++;
    }

    return { total: items.length, updated, notFound, ambiguous, invalid };
  }
}
