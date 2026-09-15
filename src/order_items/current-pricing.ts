import { OrderPricingService } from './order-pricing.service';

export interface CurrentPricing {
  /** Hozirgi amaldagi narx (so'm) — buyurtma berilsa aynan shu yoziladi */
  price: number | null;
  /** Aksiyasiz narx (so'm) */
  regular_price: number | null;
  sale_active: boolean;
  sale_ends_at: string | null;
}

export interface CartLikeRow {
  product_id?: number;
  product_model?: string;
  characteristic_id?: number | null;
  product_model_inside_id?: number | null;
  pricing?: CurrentPricing | null;
}

/**
 * Savat / "buyurtmaga tanlanganlar" qatorlariga `pricing` qo'shadi (topshiriq №15, 10-band).
 *
 * `price` (qo'shilgan paytdagi narx) TEGILMAYDI. `pricing` esa buyurtma bilan
 * AYNAN bir xil hisob (`OrderPricingService`) — sayt savatda aksiya narxini
 * chizilgan eski narx bilan ko'rsatadi va narx o'zgarganini (masalan aksiya
 * tugagan) oldindan aytadi. Hisoblab bo'lmasa (variant o'chirilgan va h.k.) — `null`.
 */
export async function attachCurrentPricing<T extends CartLikeRow>(
  pricing: OrderPricingService,
  rows: T[],
): Promise<T[]> {
  for (const row of rows) {
    try {
      const r = await pricing.resolve({
        product_id: row.product_id,
        product_model: row.product_model,
        product_model_id: row.characteristic_id ?? null,
        product_model_inside_id: row.product_model_inside_id ?? null,
      });
      row.pricing = {
        price: r.price,
        regular_price: r.regular_price,
        sale_active: r.sale_active,
        sale_ends_at: r.sale_ends_at ? r.sale_ends_at.toISOString() : null,
      };
    } catch {
      row.pricing = null;
    }
  }
  return rows;
}
