import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Review } from './model/review.model';
import { User } from 'src/users/model/user.model';
import { Product } from 'src/products/model/product.model';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review)
    private readonly ReviewReviewRepository: typeof Review,
    @InjectModel(Product)
    private readonly productRepository: typeof Product,
  ) {}

  // `products.reviews_count` — JORIY son (topshiriq №11, 2-band).
  // Sharh qo'shilsa +1, o'chirilsa -1. Statistika asosiy oqimni
  // to'xtatmasligi kerak: xato bo'lsa jimgina o'tkazib yuboramiz.
  //
  // `silent: true` — `updatedAt` ga tegmaydi, u mahsulot tahrir vaqti
  // bo'lib qolsin.
  private async bumpReviewsCount(product_id: number, by: number) {
    try {
      await this.productRepository.increment('reviews_count', {
        by,
        where: { id: product_id },
        silent: true,
      });
    } catch (error) {
      console.error('reviews_count increment error:', error.message);
    }
  }

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
    await this.bumpReviewsCount(createReviewDto.product_id, 1);
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

  //Get product reviews by product id — ochiq, shuning uchun user'dan faqat ism
  async getProductReviewsByProductId(id: number) {
    const productReviews = await this.ReviewReviewRepository.findAll({
      where: { product_id: id },
      include: [{ model: User, attributes: ['name'] }],
    });
    return productReviews;
  }

  //Get product review by id — ochiq, shuning uchun user'dan faqat ism
  async getProductReviewById(id: number) {
    const productReview = await this.ReviewReviewRepository.findOne({
      where: { id: id },
      include: [{ model: User, attributes: ['name'] }],
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
    // Mahsulot id'sini o'chirishdan OLDIN olingan yozuvdan olamiz —
    // keyin qator yo'q.
    if (deleting) {
      await this.bumpReviewsCount(existing.product_id, -deleting);
      return deleting;
    }
    throw new NotFoundException('Product review not found or something wrong');
  }
}
