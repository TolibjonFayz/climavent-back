import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Cart } from './models/cart.model';
import { RequestActor } from 'src/guards/customer_or_backoffice.guard';
import { InjectModel } from '@nestjs/sequelize';
import { UpdateCartDto } from './dto/update-cart.dto';
import { CreateCartDto } from './dto/create-cart.dto';
import { Product } from 'src/products/model/product.model';
import { CartItem } from 'src/cart_items/model/cart_item.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';
import { ProductImages } from 'src/product_images/model/product_image.model';

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart) private readonly CartRepository: typeof Cart,
    @InjectModel(CartItem) private readonly CartItemRepository: typeof CartItem,
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
  // Savat egasi yoki superadmin.
  //
  // Ilgari guard UMUMAN yo'q edi: tokensiz `GET /cart/one/:id` mijozning
  // to'liq obyektini — telefon, e-pochta, manzil, tug'ilgan sana va
  // `refresh_token` hash'ini — qaytarardi. Savat id'lari ketma-ket, ya'ni
  // hamma mijozni aylanib chiqish mumkin edi.
  //
  // Do'kon admini ATAYLAB o'tkazilmaydi: savatda boshqa do'konlarning
  // mahsulotlari va mijozning shaxsiy ma'lumoti bor.
  async getCartById(id: number, actor?: RequestActor) {
    const cart = await this.CartRepository.findOne({
      where: { id: id },
      include: { all: true },
    });
    if (!cart) throw new NotFoundException('Cart not found or id is invalid');
    const egasi = actor?.kind === 'customer' && cart.user_id === actor.user_id;
    const admin = actor?.kind === 'superadmin' || actor?.is_admin;
    if (!egasi && !admin) {
      throw new ForbiddenException('Bu savat sizga tegishli emas');
    }
    return cart;
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
            // Tanlangan SAP varianti — savat sahifasida mijoz aynan
            // qaysi variantni olayotganini ko'rishi uchun. Ko'p modelda
            // bir nechta variant bor va narxi sezilarli farq qiladi.
            { model: ProductModelInside },
          ],
        },
      ],
    });

    return userCart;
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
    await this.CartItemRepository.destroy({ where: { cart_id: id } });
    if (deleting) return deleting;
    else throw new NotFoundException('Cart not found or something wrong');
  }
}
