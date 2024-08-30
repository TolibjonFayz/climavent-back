import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Review } from './model/review.model';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review)
    private readonly ReviewReviewRepository: typeof Review,
  ) {}

  //Creating a review
  async createProductImage(createReviewDto: CreateReviewDto) {
    const newReview = await this.ReviewReviewRepository.create(createReviewDto);
    const response = {
      message: 'Review successfully created',
      newReview,
    };
    return response;
  }

  //Get all product images
  async getAllProductImages() {
    const productImages = await this.ReviewReviewRepository.findAll({
      include: { all: true },
    });
    return productImages;
  }

  //Get product image by id
  async getProductImageById(id: number) {
    const productImage = await this.ReviewReviewRepository.findOne({
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
  async updateProductImageById(id: number, updateReviewDto: UpdateReviewDto) {
    const updated = await this.ReviewReviewRepository.update(updateReviewDto, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else
      return new NotFoundException(
        'Product image not found or something wrong',
      );
  }

  //Delete product image by id
  async deleteProductImageById(id: number) {
    const deleting = await this.ReviewReviewRepository.destroy({
      where: { id: id },
    });
    if (deleting) return deleting;
    else
      throw new NotFoundException('Product image not found or something wrong');
  }
  s;
}
