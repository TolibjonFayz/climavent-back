import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Product } from 'src/products/model/product.model';
import { Characteristic } from 'src/characteristics/model/characteristic.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';
import { ProductImages } from 'src/product_images/model/product_image.model';
import { StoreRequester } from './store_auth.guard';

// SERVER TOMONDA do'konlar izolyatsiyasi (topshiriq №10, 4-band).
//
// Ilgari himoya faqat adminkaning O'Z kodida edi — ya'ni kalitni qo'lga
// kiritgan odam curl bilan istalgan do'kon mahsulotini o'zgartira olardi.
// Endi tegilayotgan yozuv QAYSI do'konga tegishli ekani serverda
// tekshiriladi.
//
// superadmin (shu jumladan SERVICE_API_KEY) — cheklovsiz.
// store_admin — faqat o'z do'koni yozuvlariga tegadi, aks holda 403.
//
// Guard StoreAuthGuard'dan KEYIN turishi shart (u `req.storeUser` ni
// to'ldiradi).
@Injectable()
export class StoreScopeGuard implements CanActivate {
  constructor(
    @InjectModel(Product) private readonly productRepo: typeof Product,
    @InjectModel(Characteristic)
    private readonly characteristicRepo: typeof Characteristic,
    @InjectModel(ProductModelInside)
    private readonly insideRepo: typeof ProductModelInside,
    @InjectModel(ProductImages)
    private readonly imageRepo: typeof ProductImages,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const requester: StoreRequester | undefined = req.storeUser;

    if (!requester || requester.role === 'superadmin') return true;

    const storeId = Number(requester.store_id);
    if (!storeId) {
      throw new ForbiddenException("Hisob hech qaysi do'konga bog'lanmagan");
    }

    const targetStoreId = await this.resolveTargetStore(req);
    if (targetStoreId === null) return true; // tegishli yozuv aniqlanmadi

    if (Number(targetStoreId) !== storeId) {
      throw new ForbiddenException(
        "Bu yozuv boshqa do'konga tegishli — o'zgartirish huquqingiz yo'q",
      );
    }
    return true;
  }

  // So'rovdan qaysi mahsulot (demak, qaysi do'kon) nazarda tutilganini
  // aniqlaydi. Yo'l va tana turlicha bo'lgani uchun bir nechta manba
  // ketma-ket tekshiriladi.
  private async resolveTargetStore(req: any): Promise<number | null> {
    const path: string = req.route?.path || req.url || '';
    const body = req.body || {};
    const idParam = Number(req.params?.id);

    // 1) Tanada to'g'ridan-to'g'ri product_id
    if (body.product_id) {
      return this.storeOfProduct(Number(body.product_id));
    }
    // 2) Tanada characteristic id (inside yaratishda `product_model_id`)
    if (body.product_model_id) {
      return this.storeOfCharacteristic(Number(body.product_model_id));
    }
    // 3) Tanada to'g'ridan-to'g'ri store_id (mahsulot yaratish)
    if (body.store_id) return Number(body.store_id);

    if (!Number.isFinite(idParam)) return null;

    // 4) Yo'lga qarab :id nimaga tegishli ekanini aniqlaymiz
    if (path.includes('/products')) return this.storeOfProduct(idParam);
    if (path.includes('/characteristics')) {
      return this.storeOfCharacteristic(idParam);
    }
    if (path.includes('/product-model-inside')) {
      const inside = await this.insideRepo.findByPk(idParam, {
        attributes: ['product_model_id'],
      });
      return inside
        ? this.storeOfCharacteristic(inside.product_model_id)
        : null;
    }
    if (path.includes('/product-images')) {
      const image = await this.imageRepo.findByPk(idParam, {
        attributes: ['product_id'],
      });
      return image ? this.storeOfProduct(image.product_id) : null;
    }
    return null;
  }

  private async storeOfProduct(productId: number): Promise<number | null> {
    if (!Number.isFinite(productId)) return null;
    const product = await this.productRepo.findByPk(productId, {
      attributes: ['store_id'],
    });
    return product ? (product.store_id ?? null) : null;
  }

  private async storeOfCharacteristic(charId: number): Promise<number | null> {
    if (!Number.isFinite(charId)) return null;
    const characteristic = await this.characteristicRepo.findByPk(charId, {
      attributes: ['product_id'],
    });
    return characteristic
      ? this.storeOfProduct(characteristic.product_id)
      : null;
  }
}
