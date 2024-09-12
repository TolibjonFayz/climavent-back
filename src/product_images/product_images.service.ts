import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductImageDto } from './dto/create-product_image.dto';
import { UpdateProductImageDto } from './dto/update-product_image.dto';
import { InjectModel } from '@nestjs/sequelize';
import { ProductImages } from './model/product_image.model';

@Injectable()
export class ProductImagesService {
  constructor(
    @InjectModel(ProductImages)
    private readonly productImageRepository: typeof ProductImages,
  ) {}

  //Create product image
  async createProductImage(createProductImageDto: CreateProductImageDto) {
    const newProductImage = await this.productImageRepository.create(
      createProductImageDto,
    );
    const response = {
      message: 'Product image successfully created',
      newProductImage,
    };
    return response;
  }

  //Get all product images
  async getAllProductImages() {
    const productImages = await this.productImageRepository.findAll();
    return productImages;
  }

  //Get product image by id
  async getProductImageById(id: number) {
    const productImage = await this.productImageRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (productImage) return productImage;
    else
      throw new NotFoundException(
        'Product image not found or product id is invalid',
      );
  }

  //Update product image by id
  async updateProductImageById(
    id: number,
    updateProductImageDto: UpdateProductImageDto,
  ) {
    const updated = await this.productImageRepository.update(
      updateProductImageDto,
      {
        where: { id: id },
        returning: true,
      },
    );
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else
      return new NotFoundException(
        'Product image not found or something wrong',
      );
  }

  //Delete product image by id
  async deleteProductImageById(id: number) {
    const deleting = await this.productImageRepository.destroy({
      where: { id: id },
    });
    if (deleting) return deleting;
    else
      throw new NotFoundException('Product image not found or something wrong');
  }
}
