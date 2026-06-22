import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CreateProductModelInsideDto } from './dto/create-product_model_inside.dto';
import { UpdateProductModelInsideDto } from './dto/update-product_model_inside.dto';
import { ProductModelInside } from './models/product_model_inside.model';

@Injectable()
export class ProductModelInsideService {
  constructor(
    @InjectModel(ProductModelInside)
    private readonly productModelInsideRepository: typeof ProductModelInside,
  ) {}

  // Yangi product-model-inside qo'shish
  async create(createProductModelInsideDto: CreateProductModelInsideDto) {
    return this.productModelInsideRepository.create(createProductModelInsideDto);
  }

  // Hammasi
  async findAll() {
    return this.productModelInsideRepository.findAll({
      order: [['id', 'ASC']],
    });
  }

  // Bitta model (characteristic) ga tegishli ro'yxat
  async findByModel(productModelId: number) {
    return this.productModelInsideRepository.findAll({
      where: { product_model_id: productModelId },
      order: [['id', 'ASC']],
    });
  }

  // id bo'yicha bitta
  async findOne(id: number) {
    const item = await this.productModelInsideRepository.findByPk(id);
    if (!item) throw new NotFoundException('product-model-inside topilmadi');
    return item;
  }

  // id bo'yicha yangilash
  async update(
    id: number,
    updateProductModelInsideDto: UpdateProductModelInsideDto,
  ) {
    const item = await this.findOne(id);
    return item.update(updateProductModelInsideDto);
  }

  // id bo'yicha o'chirish
  async remove(id: number) {
    const item = await this.findOne(id);
    await item.destroy();
    return { id, deleted: true };
  }
}
