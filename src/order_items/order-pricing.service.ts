import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Characteristic } from 'src/characteristics/model/characteristic.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';
import { Setting } from 'src/settings/model/setting.model';
import { USD_RATE_KEY } from 'src/settings/settings.service';
import { OrderItem } from './model/order_item.model';
import { Order } from 'src/orders/model/order.model';

export interface PricingInput {
  product_id: number;
  product_model?: string;
  product_model_id?: number | null;
  product_model_inside_id?: number | null;
}

export interface PricingResult {
  /** Bir donaning so'mdagi narxi. `null` — katalogda narx yo'q. */
  price: number | null;
  product_model_id: number | null;
  product_model_inside_id: number | null;
}

/**
 * Buyurtma qatori narxini SERVER tomonida aniqlaydi (topshiriq №13, 4-band).
 *
 * NEGA SERVERDA: ilgari narxni brauzer yuborardi va server uni tekshirmay
 * yozardi. Ya'ni:
 *   - kurs hali yuklanmagan bo'lsa sayt `0` yuborardi (`toUzs` shunday);
 *   - istalgan kishi 148 mln so'mlik mahsulotga `price: 1` yubora olardi.
 * Pul analitikasi bunday ma'lumotga tayana olmaydi.
 *
 * Narx BUYURTMA PAYTIDAGI kurs bilan hisoblanadi va shu qatorga
 * MUHRLANADI — katalog narxi yoki kurs keyin o'zgarsa, eski buyurtma
 * summasi o'zgarmaydi.
 *
 * Qoida saytnikiga AYNAN mos (`SingleProduct.vue`):
 *   1. tanlangan SAP varianti bo'lsa — uning narxi (narxi yo'q bo'lsa
 *      `null`: boshqa variantning narxini olish noto'g'ri bo'lardi);
 *   2. aks holda model: variantlaridan eng arzoni, bo'lmasa modelning
 *      o'z narxi;
 *   3. so'm = Math.round(usd * kurs).
 */
@Injectable()
export class OrderPricingService {
  private readonly logger = new Logger(OrderPricingService.name);

  constructor(
    @InjectModel(Characteristic)
    private readonly characteristicRepo: typeof Characteristic,
    @InjectModel(ProductModelInside)
    private readonly insideRepo: typeof ProductModelInside,
    @InjectModel(Setting) private readonly settingRepo: typeof Setting,
    @InjectModel(OrderItem) private readonly orderItemRepo: typeof OrderItem,
    @InjectModel(Order) private readonly orderRepo: typeof Order,
  ) {}

  async resolve(input: PricingInput): Promise<PricingResult> {
    let characteristic: Characteristic | null = null;
    let usd: number | null = null;
    let insideId: number | null = null;

    // 1) Aniq SAP varianti
    if (input.product_model_inside_id) {
      const inside = await this.insideRepo.findByPk(input.product_model_inside_id, {
        attributes: ['id', 'price', 'product_model_id'],
      });
      if (!inside) {
        throw new BadRequestException('product_model_inside_id topilmadi');
      }
      characteristic = await this.characteristicRepo.findByPk(
        inside.product_model_id,
        { attributes: ['id', 'product_id', 'price'] },
      );
      // Boshqa mahsulotning arzon variantini "tanlab" narxni tushirib
      // bo'lmasin.
      if (!characteristic || characteristic.product_id !== input.product_id) {
        throw new BadRequestException(
          "product_model_inside_id bu mahsulotga tegishli emas",
        );
      }
      insideId = inside.id;
      usd = this.musbat(inside.price);
    } else {
      // 2) Model — id bo'yicha, bo'lmasa nomi bo'yicha
      characteristic = await this.findCharacteristic(input);
      if (characteristic) usd = await this.modelNarxi(characteristic);
    }

    const rate = usd === null ? null : await this.kurs();
    const price = usd !== null && rate !== null ? Math.round(usd * rate) : null;

    return {
      price,
      product_model_id: characteristic?.id ?? null,
      product_model_inside_id: insideId,
    };
  }

  /**
   * Buyurtma summasi — qatorlar yig'indisidan (topshiriq №13, 4-band).
   * Bitta qatorning ham narxi noma'lum bo'lsa, summa ham NOMA'LUM (null):
   * qisman yig'indini "buyurtma summasi" deb ko'rsatish yolg'on bo'lardi.
   */
  async recomputeOrderTotal(orderId: number): Promise<void> {
    const items = await this.orderItemRepo.findAll({
      where: { order_id: orderId },
      attributes: ['price', 'quantity'],
    });
    const hammasiNarxli =
      items.length > 0 && items.every((i) => i.price !== null && i.price !== undefined);
    const total = hammasiNarxli
      ? items.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0)
      : null;
    // silent — `updatedAt` sayt tomonida "holat yangilangan vaqt" sifatida
    // ko'rsatiladi, summa hisoblanishi uni o'zgartirmasin.
    await this.orderRepo.update(
      { totalAmount: total } as any,
      { where: { id: orderId }, silent: true },
    );
  }

  private async findCharacteristic(input: PricingInput) {
    if (input.product_model_id) {
      const ch = await this.characteristicRepo.findByPk(input.product_model_id, {
        attributes: ['id', 'product_id', 'price'],
      });
      if (!ch || ch.product_id !== input.product_id) {
        throw new BadRequestException(
          'product_model_id bu mahsulotga tegishli emas',
        );
      }
      return ch;
    }
    if (!input.product_model) return null;

    // Eski mijozlar faqat nom yuboradi. Nomlar bir necha mahsulotda
    // takrorlanadi (282 dan 17 tasi), shuning uchun FAQAT shu mahsulot
    // ichida qidiramiz; bo'shliq/defis farqi e'tiborga olinmaydi.
    const norm = (v: string) => v.toUpperCase().replace(/[\s/_.-]/g, '');
    const target = norm(input.product_model);
    const candidates = await this.characteristicRepo.findAll({
      where: { product_id: input.product_id },
      attributes: ['id', 'product_id', 'price', 'title'],
      order: [['id', 'ASC']],
    });
    return candidates.find((c) => norm(String(c.title || '')) === target) || null;
  }

  private async modelNarxi(ch: Characteristic): Promise<number | null> {
    const insides = await this.insideRepo.findAll({
      where: { product_model_id: ch.id },
      attributes: ['price'],
    });
    const narxlar = insides
      .map((i) => this.musbat(i.price))
      .filter((p): p is number => p !== null);
    if (narxlar.length) return Math.min(...narxlar);
    return this.musbat(ch.price);
  }

  private musbat(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // Kurs yo'q bo'lsa buyurtmani TO'XTATMAYMIZ — narx `null` bo'ladi
  // ("narx yozilmagan"). Mijoz buyurtma bera olgani muhimroq; taxminiy
  // kurs bilan noto'g'ri summa yozish esa undan yomon.
  private async kurs(): Promise<number | null> {
    const s = await this.settingRepo.findOne({ where: { key: USD_RATE_KEY } });
    const rate = Number(s?.value);
    if (!Number.isFinite(rate) || rate <= 0) {
      this.logger.warn("Dollar kursi sozlanmagan — buyurtma narxsiz yozildi");
      return null;
    }
    return rate;
  }
}
