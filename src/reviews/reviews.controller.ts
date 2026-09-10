import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Review } from './model/review.model';
import { Privileged } from 'src/common/decorators/privileged.decorator';
import { UserGuard } from 'src/guards/user.guard';
import { CustomerOrBackofficeGuard } from 'src/guards/customer_or_backoffice.guard';
import { UserSelfBodyGuard } from 'src/guards/user_self_body.guard';
import { JwtOrServiceKeyGuard } from 'src/guards/jwt_or_service_key.guard';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // Create product review — faqat o'z nomidan (body.user_id == token egasi).
  //
  // Ilgari bu yerda guard UMUMAN yo'q edi (topshiriq №12, 1-band):
  // tokensiz, istalgan `user_id` nomidan sharh yozish mumkin edi. Bu
  // faqat saytdagi reytingni emas, №11 da qo'shilgan
  // `products.reviews_count` analitikasini ham buzardi.
  //
  // Moduldagi qolgan endpointlar (update/delete/all) allaqachon
  // himoyalangan edi — faqat shu bittasi tushib qolgan.
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Creating product review (self)' })
  @UseGuards(UserSelfBodyGuard)
  @Post('create')
  async create(@Body() createReviewDto: CreateReviewDto) {
    return this.reviewsService.createProductReview(createReviewDto);
  }

  // Get all product reviews — admin JWT YOKI servis kaliti (topshiriq
  // №11, 1-band). Faqat O'QISH; update/delete sharh egasida qoldi.
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiOperation({ summary: 'Get all product reviews (admin or service key)' })
  @UseGuards(JwtOrServiceKeyGuard)
  @Get('all')
  async getAll(): Promise<Review[]> {
    return this.reviewsService.getAllProductreviews();
  }

  //Get product reviews by product id — ochiq, lekin user'dan faqat ism qaytadi
  @ApiOperation({ summary: 'Get product reviews by product id' })
  @Get('productone/:id')
  async getProductReviews(
    @Param('id', ParseIntPipe) id: number,
    @Privileged() privileged: boolean,
  ): Promise<Review[]> {
    // Yashirilgan sharh saytda ko'rinmaydi, adminkada ko'rinadi.
    return this.reviewsService.getProductReviewsByProductId(id, privileged);
  }

  //Get product review by id — ochiq, lekin user'dan faqat ism qaytadi
  @ApiOperation({ summary: 'Get product review by id' })
  @Get('one/:id')
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<Review> {
    return this.reviewsService.getProductReviewById(id);
  }

  // Update product review — sharh EGASI yoki ORQA OFIS (topshiriq №14,
  // 3-band). Moderatsiya uchun `is_hidden` shu endpoint orqali qo'yiladi.
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiOperation({
    summary: 'Update product review by id (egasi yoki orqa ofis)',
  })
  @UseGuards(CustomerOrBackofficeGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateReviewDto: UpdateReviewDto,
    @Req() req: any,
  ) {
    return this.reviewsService.updateProductReviewById(
      id,
      updateReviewDto,
      req.actor,
    );
  }

  // Delete product review — sharh EGASI yoki ORQA OFIS.
  //
  // ESLATMA: butunlay o'chirish qaytarib bo'lmaydi. Spam/haqorat uchun
  // `PATCH update/:id` bilan `is_hidden: true` qo'yish TAVSIYA ETILADI —
  // xato bilan yashirilgan sharhni qaytarib bo'ladi.
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiOperation({
    summary: "Delete product review by id (egasi yoki orqa ofis)",
  })
  @UseGuards(CustomerOrBackofficeGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.reviewsService.deleteProductReviewById(id, req.actor);
  }
}
