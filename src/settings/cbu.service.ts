import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';

const CBU_URL =
  process.env.CBU_USD_URL || 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/';
const TIMEOUT_MS = 10_000;

export interface CbuRate {
  rate: number;
  /** Markaziy bank e'lon qilgan sana — `kk.oo.yyyy` */
  date: string;
}

/**
 * Markaziy bank kursi (topshiriq №19, 3-band).
 *
 * Ochiq API, guvohnoma talab qilmaydi. Javob shakli:
 *   [{ "Ccy": "USD", "Rate": "12185.00", "Date": "16.09.2026", ... }]
 */
@Injectable()
export class CbuService {
  private readonly logger = new Logger(CbuService.name);

  async fetchUsd(): Promise<CbuRate> {
    let data: any;
    try {
      const res = await axios.get(CBU_URL, {
        timeout: TIMEOUT_MS,
        // Markaziy bank ba'zan HTML xato sahifasi qaytaradi — o'zimiz tekshiramiz
        responseType: 'json',
      });
      data = res.data;
    } catch (e) {
      throw new ServiceUnavailableException(
        `Markaziy bank javob bermadi: ${(e as Error).message}`,
      );
    }

    const row = Array.isArray(data)
      ? data.find((r: any) => String(r?.Ccy).toUpperCase() === 'USD') || data[0]
      : null;
    const rate = Number(row?.Rate);

    // Bir necha barobar farq — ehtimol javob shakli o'zgargan yoki xato
    // sahifa keldi. Bunday qiymatni QABUL QILMAYMIZ: noto'g'ri kurs butun
    // katalogdagi narxlarni buzadi, eski kurs esa faqat biroz eskiradi.
    if (!Number.isFinite(rate) || rate < 1000 || rate > 1_000_000) {
      throw new ServiceUnavailableException(
        `Markaziy bank javobidan kurs o'qib bo'lmadi: ${JSON.stringify(row)?.slice(0, 200)}`,
      );
    }

    return { rate, date: String(row?.Date || '') };
  }
}
