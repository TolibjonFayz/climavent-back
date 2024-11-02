import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Cart } from './models/cart.model';
import { CartItem } from 'src/cart_items/model/cart_item.model';
import { Product } from 'src/products/model/product.model';
import { ProductImages } from 'src/product_images/model/product_image.model';

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart) private readonly CartRepository: typeof Cart,
  ) {}

  //Creating a cart
  async createCart(createCartDto: CreateCartDto) {
    const newCart = await this.CartRepository.create(createCartDto);
    const response = { message: 'Cart successfully created', newCart };
    return response;
  }

  //Get all carts
  async getAllCarts() {
    const carts = await this.CartRepository.findAll({ include: { all: true } });
    return carts;
  }

  //Get cart by id
  async getCartById(id: number) {
    const cart = await this.CartRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (cart) return cart;
    else throw new NotFoundException('Cart not found or id is invalid');
  }

  //Get cart by userid
  async getCartByUserId(id: number) {
    const userCart = await this.CartRepository.findOne({
      where: { user_id: id },
      include: [
        {
          model: CartItem,
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
        },
      ],
    });

    if (userCart) return userCart;
    else throw new NotFoundException('User cart not found or id is invalid');
  }

  //Update cart by id
  async updateCartById(id: number, updateCartDto: UpdateCartDto) {
    const updated = await this.CartRepository.update(updateCartDto, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else return new NotFoundException('Cart not found or something wrong');
  }

  //Delete cart by id
  async deleteCartById(id: number) {
    const deleting = await this.CartRepository.destroy({ where: { id: id } });
    if (deleting) return deleting;
    else throw new NotFoundException('Cart not found or something wrong');
  }
}
