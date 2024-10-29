import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductModelDto } from './dto/create-product_model.dto';
import { UpdateProductModelDto } from './dto/update-product_model.dto';
import { InjectModel } from '@nestjs/sequelize';
import { ProductModels } from './models/product_model.model';

@Injectable()
export class ProductModelsService {
  constructor(
    @InjectModel(ProductModels)
    private readonly productModelRepository: typeof ProductModels,
  ) {}

  //Create product model
  async createProductModel(createProductModelDto: CreateProductModelDto) {
    const newProductModel = await this.productModelRepository.create(
      createProductModelDto,
    );
    const response = {
      message: 'Product model successfully created',
      newProductModel,
    };
    return response;
  }

  //Get all product models
  async getAllProductModels() {
    const productModels = await this.productModelRepository.findAll();
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
    const updated = await this.productModelRepository.update(
      updateProductModelDto,
      {
        where: { id: id },
        returning: true,
      },
    );
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else
      return new NotFoundException(
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
}
