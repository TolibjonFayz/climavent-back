import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateLikeDto } from './dto/create-like.dto';
import { UpdateLikeDto } from './dto/update-like.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Like } from './model/like.model';
import { User } from 'src/users/model/user.model';
import { Product } from 'src/products/model/product.model';
import { ProductImages } from 'src/product_images/model/product_image.model';

@Injectable()
export class LikesService {
  constructor(
    @InjectModel(Like) private readonly likeRepository: typeof Like,
  ) {}

  //Create like
  async createLike(createLikeDto: CreateLikeDto) {
    //Is user liked this proiduct before???
    const isUserLikedThisProductBefore = await this.likeRepository.findOne({
      where: {
        user_id: createLikeDto.user_id,
        product_id: createLikeDto.product_id,
      },
    });
    if (isUserLikedThisProductBefore)
      throw new BadRequestException('This user liked this product already');
    const newLike = await this.likeRepository.create(createLikeDto);
    const response = {
      message: 'Like successfully created',
      newLike,
    };
    return response;
  }

  //Get all likes of a user
  async getUserAllLikes(user_id: number) {
    const likes = await this.likeRepository.findAll({
      where: { user_id: user_id },
      include: [
        {
          model: Product,
          include: [
            {
              model: ProductImages,
              as: 'images',
            },
          ],
        },
      ],
    });
    return likes;
  }

  //Get allll likes
  async getAllLikes() {
    const likes = await this.likeRepository.findAll();
    return likes;
  }

  //Get one like by id
  async getOneLikeById(id: number) {
    const like = await this.likeRepository.findOne({ where: { id: id } });
    if (like) return like;
    else
      throw new NotFoundException('Liked not found or product id is invalid');
  }

  //Update one like by id
  async updateOneLikeById(id: number, updateOneLikeDto: UpdateLikeDto) {
    const updated = await this.likeRepository.update(updateOneLikeDto, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else return new NotFoundException('Like not found or something wrong');
  }

  //Delete one like by id
  async deleteOneLikeById(user_id: number, product_id: number) {
    const deleting = await this.likeRepository.destroy({
      where: { user_id, product_id },
    });
    if (deleting) return deleting;
    else throw new NotFoundException('Like not found or something wrong');
  }
}
