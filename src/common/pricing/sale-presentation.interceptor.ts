import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import type { Request } from 'express';
import type { Sequelize } from 'sequelize';
import { Observable, from, mergeMap } from 'rxjs';
import { isSaleActive, productPriceSummary } from './sale';
import { Currency, currentUsdRate, isCurrency, toUsd, toUzs } from './currency';

/**
 * Narx maydonlarini JAVOB darajasida tayyorlaydi — aksiya (topshiriq №15, 3- va
 * 4-band) va valyuta (№37).
 *
 * NEGA INTERCEPTOR: variant va model mahsulot, savat, sevimlilar va boshqa
 * javoblarga `include` orqali (ko'pincha `{ all: true }` bilan) ichma-ich
 * tushadi — har bir servisda alohida tozalash biror joyni albatta unutardi.
 * Bu yerda javobning istalgan chuqurligidagi narx qatori bitta qoidada
 * qayta ishlanadi.
 *
 * AKSIYA:
 *   mehmon:  `sale_price` va `sale_ends_at` — faqat aksiya FAOL bo'lsa, aks holda
 *            `null`; `sale_starts_at` umuman chiqmaydi (rejalashtirilgan aksiya
 *            oldindan ma'lum bo'lmasin). Sayt sanani o'zi tekshirmaydi.
 *   adminka: xom qiymatlar (tugagan va rejalashtirilgani ham) + `sale_active`.
 *
 * VALYUTA (№37) — `currency` li narx qatori (model, SAP varianti):
 *   price          — DOIM DOLLARDA: UZS qatorda `price_uzs / kurs`. Eski
 *                    sayt va ilovalar `price` ni kursga ko'paytiradi —
 *                    so'm qaytsa 5 mln x 11 840 ko'rsatib yuborardi;
 *   price_input    — sotuvchi kiritgan qiymat, o'z valyutasida (adminka);
 *   price_uzs      — so'mda, butun son (UZS — kiritilgani, USD — price x kurs);
 *   sale_price / sale_price_input / sale_price_uzs — xuddi shunday.
 *
 * `characters` massivi bor obyektga (mahsulot) `on_sale`, `min_price`,
 * `min_sale_price` (USD) va `min_price_uzs`, `min_sale_price_uzs` qo'shiladi —
 * xom qiymatlardan, tozalash va aylantirishdan OLDIN.
 *
 * Javobda `"sale_price"` ham, `"currency"` ham bo'lmasa hech narsaga tegilmaydi.
 */
@Injectable()
export class SalePresentationInterceptor implements NestInterceptor {
  constructor(private readonly sequelize: Sequelize) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      mergeMap((data) => from(presentPrices(data, Boolean(req.isPrivileged), () => currentUsdRate(this.sequelize)))),
    );
  }
}

export async function presentPrices(
  data: unknown,
  privileged: boolean,
  rate: () => Promise<number | null>,
  now: number = Date.now(),
): Promise<unknown> {
  if (data === null || typeof data !== 'object') return data;
  if (data instanceof StreamableFile || Buffer.isBuffer(data)) return data;

  let json: string;
  try {
    json = JSON.stringify(data);
  } catch {
    return data;
  }
  if (json === undefined) return data;
  const hasSale = json.includes('"sale_price"');
  const hasCurrency = json.includes('"currency"');
  if (!hasSale && !hasCurrency) return data;

  const plain = JSON.parse(json);
  walk(plain, { privileged, now, rate: hasCurrency ? await rate() : null });
  return plain;
}

interface Ctx {
  privileged: boolean;
  now: number;
  rate: number | null;
}

function walk(node: unknown, ctx: Ctx): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, ctx);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const obj = node as Record<string, any>;

  // Mahsulot: bolalari hali tozalanmagan va aylantirilmagan — xom qiymatlardan
  // (bir mahsulot ichida valyuta bitta, shuning uchun min'lar to'g'ri).
  if (Array.isArray(obj.characters)) {
    const s = productPriceSummary(obj, ctx.now);
    const cur = productCurrency(obj);
    if (cur) {
      Object.assign(obj, {
        on_sale: s.on_sale,
        min_price: toUsd(s.min_price, cur, ctx.rate),
        min_sale_price: toUsd(s.min_sale_price, cur, ctx.rate),
        min_price_uzs: toUzs(s.min_price, cur, ctx.rate),
        min_sale_price_uzs: toUzs(s.min_sale_price, cur, ctx.rate),
      });
    } else {
      Object.assign(obj, s);
    }
  }

  // Faollik XOM qiymatlardan (bir valyutada) — aylantirishdan oldin
  const saleActive = 'sale_price' in obj ? isSaleActive(obj, ctx.now) : false;

  if ('price' in obj && isCurrency(obj.currency) && !Array.isArray(obj.characters)) {
    convertRow(obj, obj.currency, ctx.rate);
  }

  if ('sale_price' in obj) {
    if (ctx.privileged) {
      obj.sale_active = saleActive;
    } else {
      if (!saleActive) {
        obj.sale_price = null;
        obj.sale_ends_at = null;
        if ('sale_price_uzs' in obj) obj.sale_price_uzs = null;
        if ('sale_price_input' in obj) obj.sale_price_input = null;
      }
      delete obj.sale_starts_at;
    }
  }

  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === 'object') walk(value, ctx);
  }
}

function convertRow(obj: Record<string, any>, cur: Currency, rate: number | null) {
  const raw = obj.price;
  obj.price_input = raw ?? null;
  obj.price_uzs = toUzs(raw, cur, rate);
  obj.price = toUsd(raw, cur, rate);
  if ('sale_price' in obj) {
    const rawSale = obj.sale_price;
    obj.sale_price_input = rawSale ?? null;
    obj.sale_price_uzs = toUzs(rawSale, cur, rate);
    obj.sale_price = toUsd(rawSale, cur, rate);
  }
}

/** Mahsulot valyutasi; mahsulot maydoni tanlanmagan bo'lsa — birinchi modelnikidan. */
function productCurrency(p: Record<string, any>): Currency | null {
  if (isCurrency(p.currency)) return p.currency;
  const c = (p.characters || []).find((x: any) => isCurrency(x?.currency));
  return c ? c.currency : null;
}
