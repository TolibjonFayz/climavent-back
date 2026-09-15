import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Characteristic } from 'src/characteristics/model/characteristic.model';
import { ProductModelInside } from 'src/product_model_inside/models/product_model_inside.model';
import { Setting } from 'src/settings/model/setting.model';
import { USD_RATE_KEY } from 'src/settings/settings.service';
import { OrderItem } from './model/order_item.model';
import { Order } from 'src/orders/model/order.model';
import { basePrice, effectivePrice, isSaleActive, pricedOptions } from 'src/common/pricing/sale';

const PRICE_ATTRS = ['price', 'sale_price', 'sale_starts_at', 'sale_ends_at'];

export interface PricingInput {
  product_id: number;
  product_model?: string;
  product_model_id?: number | null;
  product_model_inside_id?: number | null;
}

export interface PricingResult {
  /** Bir donaning so'mdagi AMALDAGI narxi (faol aksiya hisobga olingan). `null` — katalogda narx yo'q. */
  price: number | null;
  /** Aksiyasiz asosiy narx (so'm). */
  regular_price: number | null;
  /** Narx aksiya bo'yicha hisoblandimi */
  sale_active: boolean;
  /** Faol aksiya tugash vaqti (bo'lsa) */
  sale_ends_at: Date | null;
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
 *
 * AKSIYA (topshiriq №15, 5-band): "narx" — AMALDAGI narx: faol aksiya bo'lsa
 * aksiya narxi. Faollik shu yerda, buyurtma paytida qayta hisoblanadi — savatga
 * solingandan keyin aksiya tugagan bo'lsa ham to'g'ri narx yoziladi. Asosiy
 * narx `regular_price` ga alohida muhrlanadi (hisobot uchun).
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
    const now = Date.now();
    let characteristic: Characteristic | null = null;
    let usd: number | null = null;
    let regularUsd: number | null = null;
    let saleRow: { sale_ends_at?: unknown } | null = null;
    let insideId: number | null = null;

    // 1) Aniq SAP varianti
    if (input.product_model_inside_id) {
      const inside = await this.insideRepo.findByPk(input.product_model_inside_id, {
        attributes: ['id', 'product_model_id', ...PRICE_ATTRS],
      });
      if (!inside) {
        throw new BadRequestException('product_model_inside_id topilmadi');
      }
      characteristic = await this.characteristicRepo.findByPk(
        inside.product_model_id,
        { attributes: ['id', 'product_id', ...PRICE_ATTRS] },
      );
      // Boshqa mahsulotning arzon variantini "tanlab" narxni tushirib
      // bo'lmasin.
      if (!characteristic || characteristic.product_id !== input.product_id) {
        throw new BadRequestException(
          "product_model_inside_id bu mahsulotga tegishli emas",
        );
      }
      insideId = inside.id;
      usd = effectivePrice(inside, now);
      regularUsd = basePrice(inside);
      if (isSaleActive(inside, now)) saleRow = inside;
    } else {
      // 2) Model — id bo'yicha, bo'lmasa nomi bo'yicha
      characteristic = await this.findCharacteristic(input);
      if (characteristic) {
        const chosen = await this.modelNarxi(characteristic, now);
        if (chosen) {
          usd = chosen.effective;
          regularUsd = chosen.base;
          if (chosen.onSale) saleRow = chosen.row;
        }
      }
    }

    const rate = usd === null ? null : await this.kurs();
    const toUzs = (v: number | null) => (v !== null && rate !== null ? Math.round(v * rate) : null);
    const endsAt = saleRow?.sale_ends_at ? new Date(saleRow.sale_ends_at as string) : null;

    return {
      price: toUzs(usd),
      regular_price: toUzs(regularUsd),
      sale_active: saleRow !== null,
      sale_ends_at: endsAt,
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
        attributes: ['id', 'product_id', ...PRICE_ATTRS],
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
      attributes: ['id', 'product_id', 'title', ...PRICE_ATTRS],
      order: [['id', 'ASC']],
    });
    return candidates.find((c) => norm(String(c.title || '')) === target) || null;
  }

  // Variant tanlanmagan model: AMALDAGI narx bo'yicha eng arzon variant
  // (aksiyadagi qimmat variant arzonga tushgan bo'lsa — o'sha), bo'lmasa model.
  private async modelNarxi(ch: Characteristic, now: number) {
    const insides = await this.insideRepo.findAll({
      where: { product_model_id: ch.id },
      attributes: PRICE_ATTRS,
    });
    const options = pricedOptions({ ...ch.get({ plain: true }), insides }, now);
    if (!options.length) return null;
    return options.reduce((best, o) => (o.effective < best.effective ? o : best));
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
