import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCartItemDto } from './dto/create-cart_item.dto';
import { UpdateCartItemDto } from './dto/update-cart_item.dto';
import { InjectModel } from '@nestjs/sequelize';
import { CartItem } from './model/cart_item.model';

@Injectable()
export class CartItemsService {
  constructor(
    @InjectModel(CartItem) private readonly CartItemRepository: typeof CartItem,
  ) {}

  //Creating a cart item
  async createCartItem(createCartItemDto: CreateCartItemDto) {
    const isThisExists = await this.CartItemRepository.findOne({
      where: {
        cart_id: createCartItemDto.cart_id,
        product_id: createCartItemDto.product_id,
        product_model: createCartItemDto.product_model,
      },
    });
    if (isThisExists == null) {
      const newCartItem =
        await this.CartItemRepository.create(createCartItemDto);
      const response = {
        message: 'Cart item successfully created',
        newCartItem,
      };
      return response;
    } else {
      const response = await this.CartItemRepository.update(
        { quantity: isThisExists.quantity + createCartItemDto.quantity },
        {
          where: {
            cart_id: createCartItemDto.cart_id,
            product_id: createCartItemDto.product_id,
            product_model: createCartItemDto.product_model,
          },
        },
      );
      return {
        message: 'Cart item successfully created',
        response,
      };
    }
  }

  //Get all cart items
  async getAllCartItems() {
    const cartItems = await this.CartItemRepository.findAll({
      include: { all: true },
    });
    return cartItems;
  }

  //Get cart item by id
  async getCartItemById(id: number) {
    const cartItem = await this.CartItemRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (cartItem) return cartItem;
    else
      throw new NotFoundException(
        'Cart item not found or product id is invalid',
      );
  }

  //Update cart item by id
  async updateCartItemById(id: number, updateCartItemDto: UpdateCartItemDto) {
    const updated = await this.CartItemRepository.update(updateCartItemDto, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else return new NotFoundException('Cart item not found or something wrong');
  }

  //Delete cart item by id
  async deleteCartItemById(id: number) {
    const deleting = await this.CartItemRepository.destroy({
      where: { id: id },
    });
    if (deleting) return deleting;
    else throw new NotFoundException('Cart item not found or something wrong');
  }
}
