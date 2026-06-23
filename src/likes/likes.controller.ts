import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { LikesService } from './likes.service';
import { CreateLikeDto } from './dto/create-like.dto';
import { UpdateLikeDto } from './dto/update-like.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Like } from './model/like.model';
import { UserSelfGuard } from 'src/guards/user_self.guard';
import { UserSelfBodyGuard } from 'src/guards/user_self_body.guard';
import { AdminGuard } from 'src/guards/admin.guard';

@ApiTags('Likes')
@Controller('likes')
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  //Create like — faqat o'z nomidan (body.user_id == token egasi)
  @ApiOperation({ summary: 'Create like (self)' })
  @UseGuards(UserSelfBodyGuard)
  @Post('create')
  async create(@Body() createLikeDto: CreateLikeDto) {
    return this.likesService.createLike(createLikeDto);
  }

  //Get all likes of a user — faqat o'sha foydalanuvchining o'zi
  @ApiOperation({ summary: 'Get all user likes (self)' })
  @UseGuards(UserSelfGuard)
  @Get('useralllikes/:id')
  async getAllUserlikes(@Param('id') id: number): Promise<Like[]> {
    return this.likesService.getUserAllLikes(id);
  }

  //Get allll likes — faqat admin (barcha foydalanuvchilar like'larini ko'rsatadi)
  @ApiOperation({ summary: 'Get allll likes (admin)' })
  @UseGuards(AdminGuard)
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

  //Update like by id — frontend ishlatmaydi, faqat admin
  @ApiOperation({ summary: 'Update like by id (admin)' })
  @UseGuards(AdminGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateLikeDto: UpdateLikeDto,
  ) {
    return this.likesService.updateOneLikeById(id, updateLikeDto);
  }

  //Delete one like — faqat o'z nomidan (body.user_id == token egasi)
  @ApiOperation({ summary: 'Delete one like (self)' })
  @UseGuards(UserSelfBodyGuard)
  @Delete('delete')
  async deleteOne(@Body() body: { user_id: number; product_id: number }) {
    return this.likesService.deleteOneLikeById(body.user_id, body.product_id);
  }
} 
