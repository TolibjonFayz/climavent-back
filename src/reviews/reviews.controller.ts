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
import { UserGuard } from 'src/guards/user.guard';
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
  async getProductReviews(@Param('id', ParseIntPipe) id: number): Promise<Review[]> {
    return this.reviewsService.getProductReviewsByProductId(id);
  }

  //Get product review by id — ochiq, lekin user'dan faqat ism qaytadi
  @ApiOperation({ summary: 'Get product review by id' })
  @Get('one/:id')
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<Review> {
    return this.reviewsService.getProductReviewById(id);
  }

  //Update product review by id — faqat sharh egasi yoki admin
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product review by id (owner or admin)' })
  @UseGuards(UserGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateReviewDto: UpdateReviewDto,
    @Req() req: any,
  ) {
    return this.reviewsService.updateProductReviewById(
      id,
      updateReviewDto,
      req.user,
    );
  }

  //Delete product review by id — faqat sharh egasi yoki admin
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete product review by id (owner or admin)' })
  @UseGuards(UserGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.reviewsService.deleteProductReviewById(id, req.user);
  }
}
