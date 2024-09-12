import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { LikesService } from './likes.service';
import { CreateLikeDto } from './dto/create-like.dto';
import { UpdateLikeDto } from './dto/update-like.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Like } from './model/like.model';

@ApiTags('Likes')
@Controller('likes')
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  //Create product image
  @ApiOperation({ summary: 'Create product image' })
  @Post('create')
  async create(@Body() createLikeDto: CreateLikeDto) {
    return this.likesService.createLike(createLikeDto);
  }

  //Get all likes of a user
  @ApiOperation({ summary: 'Get all user likes' })
  @Get('useralllikes/:id')
  async getAllUserlikes(@Param('id') id: number): Promise<Like[]> {
    return this.likesService.getUserAllLikes(id);
  }

  //Get allll likes
  @ApiOperation({ summary: 'Get allll likes' })
  @Get('alllikes')
  async getAll(): Promise<Like[]> {
    return this.likesService.getAllLikes();
  }

  //Get one like by id
  @ApiOperation({ summary: 'Get one like by id' })
  @Get('one/:id')
  async getOne(@Param('id') id: number): Promise<Like> {
    return this.likesService.getOneLikeById(id);
  }

  //Update product by id
  @ApiOperation({ summary: 'Update product image by id' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateLikeDto: UpdateLikeDto,
  ) {
    return this.likesService.updateOneLikeById(id, updateLikeDto);
  }

  //Delete one like by id
  @ApiOperation({ summary: 'Delete one like by id' })
  @Delete('delete')
  async deleteOne(@Body() body: { user_id: number; product_id: number }) {
    return this.likesService.deleteOneLikeById(body.user_id, body.product_id);
  }
}
