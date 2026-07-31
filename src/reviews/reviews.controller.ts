import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Review } from './model/review.model';
import { UserGuard } from 'src/guards/user.guard';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  //Create product reviews
  @ApiOperation({ summary: 'Creating product review' })
  @Post('create')
  async create(@Body() createReviewDto: CreateReviewDto) {
    return this.reviewsService.createProductReview(createReviewDto);
  }

  //Get all product reviews
  @ApiOperation({ summary: 'Get all product reviews' })
  @Get('all')
  async getAll(): Promise<Review[]> {
    return this.reviewsService.getAllProductreviews();
  }

  //Get product reviews by product id
  @ApiOperation({ summary: 'Get product reviews by product id' })
  @Get('productone/:id')
  async getProductReviews(@Param('id') id: number): Promise<Review[]> {
    return this.reviewsService.getProductReviewsByProductId(id);
  }

  //Get product review by id
  @ApiOperation({ summary: 'Get product review by id' })
  @Get('one/:id')
  async getOne(@Param('id') id: number): Promise<Review> {
    return this.reviewsService.getProductReviewById(id);
  }

  //Update product review by id — faqat sharh egasi yoki admin
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product review by id (owner or admin)' })
  @UseGuards(UserGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
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
  async deleteOne(@Param('id') id: number, @Req() req: any) {
    return this.reviewsService.deleteProductReviewById(id, req.user);
  }
}
