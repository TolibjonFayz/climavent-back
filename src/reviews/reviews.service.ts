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
  async createProductReview(createReviewDto: CreateReviewDto) {
    const newReview = await this.ReviewReviewRepository.create(createReviewDto);
    const response = {
      message: 'Review successfully created',
      newReview,
    };
    return response;
  }

  //Get all product reviews
  async getAllProductreviews() {
    const productReviews = await this.ReviewReviewRepository.findAll({
      include: { all: true },
    });
    return productReviews;
  }

  //Get product review by id
  async getProductReviewById(id: number) {
    const productReview = await this.ReviewReviewRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (productReview) return productReview;
    else
      throw new NotFoundException(
        'Product review not found or product id is invalid',
      );
  }

  //Update product review by id
  async updateProductReviewById(id: number, updateReviewDto: UpdateReviewDto) {
    const updated = await this.ReviewReviewRepository.update(updateReviewDto, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else
      return new NotFoundException(
        'Product review not found or something wrong',
      );
  }

  //Delete product review by id
  async deleteProductReviewById(id: number) {
    const deleting = await this.ReviewReviewRepository.destroy({
      where: { id: id },
    });
    if (deleting) return deleting;
    else
      throw new NotFoundException(
        'Product review not found or something wrong',
      );
  }
  s;
}
