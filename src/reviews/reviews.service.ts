import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

  // Sharh egasini (yoki admin ekanini) tekshiradi
  private ensureOwnerOrAdmin(
    review: Review,
    requester: { id?: number; is_admin?: boolean },
  ) {
    if (review.user_id !== requester?.id && !requester?.is_admin) {
      throw new ForbiddenException('Bu sharh sizga tegishli emas');
    }
  }

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

  //Get product reviews by product id
  async getProductReviewsByProductId(id: number) {
    const productReviews = await this.ReviewReviewRepository.findAll({
      where: { product_id: id },
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

  //Update product review by id — faqat sharh egasi yoki admin
  async updateProductReviewById(
    id: number,
    updateReviewDto: UpdateReviewDto,
    requester: { id?: number; is_admin?: boolean },
  ) {
    const existing = await this.ReviewReviewRepository.findByPk(id);
    if (!existing) {
      throw new NotFoundException('Product review not found or something wrong');
    }
    this.ensureOwnerOrAdmin(existing, requester);

    if (Object.keys(updateReviewDto).length === 0) {
      return existing.dataValues;
    }

    const updated = await this.ReviewReviewRepository.update(updateReviewDto, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else
      throw new NotFoundException(
        'Product review not found or something wrong',
      );
  }

  //Delete product review by id — faqat sharh egasi yoki admin
  async deleteProductReviewById(
    id: number,
    requester: { id?: number; is_admin?: boolean },
  ) {
    const existing = await this.ReviewReviewRepository.findByPk(id);
    if (!existing) {
      throw new NotFoundException('Product review not found or something wrong');
    }
    this.ensureOwnerOrAdmin(existing, requester);

    const deleting = await this.ReviewReviewRepository.destroy({
      where: { id: id },
    });
    if (deleting) return deleting;
    else
      throw new NotFoundException(
        'Product review not found or something wrong',
      );
  }
}
