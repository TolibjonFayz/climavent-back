import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateSelectedToCheckoutDto } from './dto/create-selected_to_checkout.dto';
import { InjectModel } from '@nestjs/sequelize';
import { SelectedToCheckoutModels } from './model/selected_to_checkout.model';
import { Product } from 'src/products/model/product.model';
import { ProductImages } from 'src/product_images/model/product_image.model';
import { CartItem } from 'src/cart_items/model/cart_item.model';
import { Cart } from 'src/cart/models/cart.model';
import { OrderPricingService } from 'src/order_items/order-pricing.service';
import { attachCurrentPricing } from 'src/order_items/current-pricing';

@Injectable()
export class SelectedToCheckoutService {
  constructor(
    @InjectModel(SelectedToCheckoutModels)
    private readonly selecteddToChRepository: typeof SelectedToCheckoutModels,
    @InjectModel(CartItem) private readonly CartItemRepository: typeof CartItem,
    @InjectModel(Cart) private readonly CartRepository: typeof Cart,
    private readonly pricing: OrderPricingService,
  ) {}

  //Create selected to checkout
  async createSelectedToCh(
    createSelectedToCheckoutDto: CreateSelectedToCheckoutDto,
  ) {
    // Dublikat — faqat AYNAN o'sha model va variant bo'lsa.
    //
    // Ilgari kalit faqat (user_id, product_id) edi. Savat esa 2026-09-03
    // dan beri bir mahsulotning turli variantlarini ALOHIDA qator qilib
    // saqlaydi — ya'ni ikkinchi variant checkout'ga "already selected"
    // deb JIMGINA tushmay qolardi va buyurtmadan tushib qolardi (summa
    // ham kam chiqardi). Kalit savatdagi bilan bir xil qilindi.
    const checkselectedToCh = await this.selecteddToChRepository.findAll({
      where: {
        user_id: createSelectedToCheckoutDto.user_id,
        product_id: createSelectedToCheckoutDto.product_id,
        product_model: createSelectedToCheckoutDto.product_model,
        product_model_inside_id:
          createSelectedToCheckoutDto.product_model_inside_id ?? null,
      },
    });
    if (checkselectedToCh.length > 0) {
      ``;
      return {
        message: 'Product already selected to checkout',
        status: 400,
      };
    } else {
      try {
        const newSelectedToCh = await this.selecteddToChRepository.create(
          createSelectedToCheckoutDto,
        );
        const response = {
          message: 'Selected to checkout successfully created',
          newSelectedToCh,
        };
        return response;
      } catch (error) {
        console.log(error);
        return error;
      }
    }
  }

  //Get all selected to checkouts
  async getAllSelectedToCheckouts() {
    const selectedtochecouts = await this.selecteddToChRepository.findAll();
    return selectedtochecouts;
  }

  async getUserCheckedOnes(userid: number) {
    const result = await this.selecteddToChRepository.findAll({
      where: { user_id: userid },
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
    // Rasmiylashtirish sahifasi summasi buyurtma bilan bir xil hisobdan (№15)
    return attachCurrentPricing(this.pricing, JSON.parse(JSON.stringify(result)));
  }

  //Delete selected to checkout by user id
  async deleteSelectedToCh(user_id: number) {
    const deleted = await this.selecteddToChRepository.destroy({
      where: { user_id: user_id },
    });

    if (!deleted) {
      throw new NotFoundException('Selected to checkout not found');
    }

    return {
      message: 'Selected to checkout successfully deleted',
      status: 200,
    };
  }

  //Delete selected to checkouts which are in the cart
  async deleteSelectedToChInCart(user_id: number) {
    const products = await this.selecteddToChRepository.findAll({
      where: { user_id: user_id },
      include: { all: true },
    });

    //Find user cart
    const userCart = await this.CartRepository.findOne({
      where: { user_id: user_id },
      include: { all: true },
    });

    //Need to remove selected products from cart after payment
    if (products && products.length > 0 && userCart) {
      for (const product of products) {
        await this.CartItemRepository.destroy({
          where: {
            product_id: product.product_id,
            product_model: product.product_model,
            cart_id: userCart.id,
          },
        });
      }
    }
  }
}
