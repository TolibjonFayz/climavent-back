import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCartItemDto } from './dto/create-cart_item.dto';
import { UpdateCartItemDto } from './dto/update-cart_item.dto';
import { InjectModel } from '@nestjs/sequelize';
import { CartItem } from './model/cart_item.model';
import { Cart } from 'src/cart/models/cart.model';
import { Characteristic } from 'src/characteristics/model/characteristic.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';

@Injectable()
export class CartItemsService {
  constructor(
    @InjectModel(CartItem) private readonly CartItemRepository: typeof CartItem,
    @InjectModel(Cart) private readonly CartRepository: typeof Cart,
    @InjectModel(Characteristic)
    private readonly characteristicRepository: typeof Characteristic,
    @InjectModel(ProductModelInside)
    private readonly insideRepository: typeof ProductModelInside,
  ) {}

  // Savatga solish statistikasi. Atomik increment, `silent: true` —
  // updatedAt ga tegmaydi (u tahrir vaqti bo'lib qolsin).
  // Statistika asosiy oqimni to'xtatmasligi kerak: xato bo'lsa jimgina
  // o'tkazib yuboramiz, mijoz savatga qo'sha olgan bo'lishi muhimroq.
  private async bumpCartCounters(dto: CreateCartItemDto) {
    try {
      if (dto.characteristic_id) {
        await this.characteristicRepository.increment('cart_count', {
          where: { id: dto.characteristic_id },
          silent: true,
        });
      }
      if (dto.product_model_inside_id) {
        await this.insideRepository.increment('cart_count', {
          where: { id: dto.product_model_inside_id },
          silent: true,
        });
      }
    } catch (error) {
      console.error('cart_count increment error:', error.message);
    }
  }

  // Qatorning tegishli savati egasi (yoki admin ekanini) tekshiradi
  private async ensureCartOwnerOrAdmin(
    cartId: number,
    requester: { id?: number; is_admin?: boolean },
  ) {
    const cart = await this.CartRepository.findByPk(cartId);
    if (!cart) {
      throw new NotFoundException('Cart not found or something wrong');
    }
    if (cart.user_id !== requester?.id && !requester?.is_admin) {
      throw new ForbiddenException('Bu savat sizga tegishli emas');
    }
    return cart;
  }

  //Creating a cart item — faqat savat egasi yoki admin
  async createCartItem(
    createCartItemDto: CreateCartItemDto,
    requester: { id?: number; is_admin?: boolean },
  ) {
    await this.ensureCartOwnerOrAdmin(createCartItemDto.cart_id, requester);

    // Dublikat izlashda SAP varianti ham hisobga olinadi: bir xil
    // modelning turli variantlari (masalan РВН da 64 ta, narxi $12—$97)
    // savatda ALOHIDA qator bo'lishi kerak, aks holda mijoz boshqa
    // variantni qo'shsa mavjudining soni oshib ketardi.
    const duplicateWhere = {
      cart_id: createCartItemDto.cart_id,
      product_id: createCartItemDto.product_id,
      product_model: createCartItemDto.product_model,
      product_model_inside_id: createCartItemDto.product_model_inside_id ?? null,
    };
    const isThisExists = await this.CartItemRepository.findOne({
      where: duplicateWhere,
    });
    if (isThisExists == null) {
      const newCartItem =
        await this.CartItemRepository.create(createCartItemDto);
      await this.bumpCartCounters(createCartItemDto);
      const response = {
        message: 'Cart item successfully created',
        newCartItem,
      };
      return response;
    } else {
      const response = await this.CartItemRepository.update(
        { quantity: isThisExists.quantity + createCartItemDto.quantity },
        { where: duplicateWhere },
      );
      await this.bumpCartCounters(createCartItemDto);
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

  //Update cart item by id — faqat savat egasi yoki admin
  async updateCartItemById(
    id: number,
    updateCartItemDto: UpdateCartItemDto,
    requester: { id?: number; is_admin?: boolean },
  ) {
    const existing = await this.CartItemRepository.findByPk(id);
    if (!existing) {
      throw new NotFoundException('Cart item not found or something wrong');
    }
    await this.ensureCartOwnerOrAdmin(existing.cart_id, requester);

    if (Object.keys(updateCartItemDto).length === 0) {
      return existing.dataValues;
    }

    const updated = await this.CartItemRepository.update(updateCartItemDto, {
      where: { id: id },
      returning: true,
    });
    if (updated[1][0]?.dataValues) return updated[1][0].dataValues;
    else throw new NotFoundException('Cart item not found or something wrong');
  }

  //Delete cart item by id — faqat savat egasi yoki admin
  async deleteCartItemById(
    id: number,
    requester: { id?: number; is_admin?: boolean },
  ) {
    const existing = await this.CartItemRepository.findByPk(id);
    if (!existing) {
      throw new NotFoundException('Cart item not found or something wrong');
    }
    await this.ensureCartOwnerOrAdmin(existing.cart_id, requester);

    const deleting = await this.CartItemRepository.destroy({
      where: { id: id },
    });
    if (deleting) return deleting;
    else throw new NotFoundException('Cart item not found or something wrong');
  }
}
