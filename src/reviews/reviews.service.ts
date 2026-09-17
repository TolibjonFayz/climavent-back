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
import { RequestActor } from 'src/guards/customer_or_backoffice.guard';

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

  // Sharhga yozish huquqi (topshiriq №14, 3-band).
  //
  // Ilgari faqat sharh EGASI (mijoz JWT) o'tardi — ya'ni spam yoki
  // haqorat sharhni hech kim olib tashlay olmasdi. Endi orqa ofis
  // (servis kaliti, sayt admini, do'kon hisobi) ham moderatsiya qila
  // oladi.
  private async ensureOwnerOrBackoffice(review: Review, actor: RequestActor) {
    if (actor?.kind === 'superadmin') return;

    // DO'KON ADMINI — faqat O'Z do'koni mahsulotidagi sharh (topshiriq
    // №19, 1-band).
    //
    // Ilgari `store_admin` shu yerda shartsiz o'tib ketardi: bitta sotuvchi
    // raqobatchisining mahsulotidagi salbiy sharhni yashirib qo'ya olardi
    // (oferta 6.5 va 9.3 ga zid).
    if (actor?.kind === 'store_admin') {
      const product = await this.productRepository.findByPk(review.product_id, {
        attributes: ['id', 'store_id'],
      });
      // Mahsulot topilmasa ham ruxsat bermaymiz: kimning ekani noma'lum.
      if (!product || Number(product.store_id) !== Number(actor.store_id)) {
        throw new ForbiddenException(
          "Bu sharh boshqa do'kon mahsulotiga tegishli",
        );
      }
      return;
    }

    if (review.user_id !== actor?.user_id && !actor?.is_admin) {
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
  // Yashirilgan sharhlar saytda ko'rinmaydi (topshiriq №14, 3-band).
  async getProductReviewsByProductId(id: number, privileged = false) {
    const productReviews = await this.ReviewReviewRepository.findAll({
      where: {
        product_id: id,
        ...(privileged ? {} : { is_hidden: false }),
      },
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
    actor: RequestActor,
  ) {
    const existing = await this.ReviewReviewRepository.findByPk(id);
    if (!existing) {
      throw new NotFoundException('Product review not found or something wrong');
    }
    await this.ensureOwnerOrBackoffice(existing, actor);

    // `is_hidden` o'zgarsa — mahsulotning sharh hisoblagichi ham
    // moslashadi: sayt yashirilgan sharhni ko'rsatmaydi, demak son ham
    // uni sanamasligi kerak (topshiriq №11 hisoblagichi bilan izchil).
    const yangiHidden = (updateReviewDto as any).is_hidden;
    if (yangiHidden !== undefined && yangiHidden !== existing.is_hidden) {
      await this.bumpReviewsCount(existing.product_id, yangiHidden ? -1 : 1);
    }

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
  async deleteProductReviewById(id: number, actor: RequestActor) {
    const existing = await this.ReviewReviewRepository.findByPk(id);
    if (!existing) {
      throw new NotFoundException('Product review not found or something wrong');
    }
    await this.ensureOwnerOrBackoffice(existing, actor);

    const deleting = await this.ReviewReviewRepository.destroy({
      where: { id: id },
    });
    // Mahsulot id'sini o'chirishdan OLDIN olingan yozuvdan olamiz —
    // keyin qator yo'q.
    //
    // Yashirilgan sharh hisoblagichdan ALLAQACHON chiqarilgan, shuning
    // uchun uni o'chirishda yana kamaytirmaymiz — aks holda son manfiyga
    // ketardi.
    if (deleting) {
      if (!existing.is_hidden) {
        await this.bumpReviewsCount(existing.product_id, -deleting);
      }
      return deleting;
    }
    throw new NotFoundException('Product review not found or something wrong');
  }
}
