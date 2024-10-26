import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductModelHeaderDto } from './dto/create-product_model_header.dto';
import { UpdateProductModelHeaderDto } from './dto/update-product_model_header.dto';
import { InjectModel } from '@nestjs/sequelize';
import { ProductModelHeader } from './models/product_model_header.model';

@Injectable()
export class ProductModelHeadersService {
  constructor(
    @InjectModel(ProductModelHeader)
    private readonly productModelHeaderRepository: typeof ProductModelHeader,
  ) {}

  //Create product model header
  async createProductModelHeader(
    createProductModelHeaderDto: CreateProductModelHeaderDto,
  ) {
    const newProductModelHeader =
      await this.productModelHeaderRepository.create(
        createProductModelHeaderDto,
      );
    const response = {
      message: 'Product model successfully created',
      newProductModelHeader,
    };
    return response;
  }

  //Get all product model header
  async getAllProductModelHeaders() {
    const productModels = await this.productModelHeaderRepository.findAll({
      include: { all: true },
    });
    return productModels;
  }

  //Get product model header by id
  async getProductModelHeaderById(id: number) {
    const productModel = await this.productModelHeaderRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (productModel) return productModel;
    else
      throw new NotFoundException(
        'Product model header not found or product id is invalid',
      );
  }

  //Update product model header by id
  async updateProductModelHeaderById(
    id: number,
    updateProductModelHeaderDto: UpdateProductModelHeaderDto,
  ) {
    const updated = await this.productModelHeaderRepository.update(
      updateProductModelHeaderDto,
      {
        where: { id: id },
        returning: true,
      },
    );
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else
      return new NotFoundException(
        'Product model header not found or something wrong',
      );
  }

  //Delete product model header by id
  async deleteProductModelHeaderById(id: number) {
    const deleting = await this.productModelHeaderRepository.destroy({
      where: { id: id },
    });
    if (deleting) return deleting;
    else
      throw new NotFoundException(
        'Product model header not found or something wrong',
      );
  }
}
