import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';
import { isSaleActive, productPriceSummary } from './sale';

/**
 * Aksiya maydonlarini JAVOB darajasida tayyorlaydi (topshiriq №15, 3- va 4-band).
 *
 * NEGA INTERCEPTOR: variant va model mahsulot, savat, sevimlilar va boshqa
 * javoblarga `include` orqali (ko'pincha `{ all: true }` bilan) ichma-ich
 * tushadi — har bir servisda alohida tozalash biror joyni albatta unutardi.
 * Bu yerda javobning istalgan chuqurligidagi `sale_price` li obyekt bitta
 * qoidada qayta ishlanadi.
 *
 *   mehmon:  `sale_price` va `sale_ends_at` — faqat aksiya FAOL bo'lsa, aks holda
 *            `null`; `sale_starts_at` umuman chiqmaydi (rejalashtirilgan aksiya
 *            oldindan ma'lum bo'lmasin). Sayt sanani o'zi tekshirmaydi.
 *   adminka: xom qiymatlar (tugagan va rejalashtirilgani ham) + `sale_active`.
 *
 * `characters` massivi bor obyektga (mahsulot) `on_sale`, `min_price`,
 * `min_sale_price` qo'shiladi — xom qiymatlardan, tozalashdan OLDIN.
 *
 * Javobda `"sale_price"` bo'lmasa hech narsaga tegilmaydi.
 */
@Injectable()
export class SalePresentationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(map((data) => presentSales(data, Boolean(req.isPrivileged))));
  }
}

export function presentSales(data: unknown, privileged: boolean, now: number = Date.now()): unknown {
  if (data === null || typeof data !== 'object') return data;
  if (data instanceof StreamableFile || Buffer.isBuffer(data)) return data;

  let json: string;
  try {
    json = JSON.stringify(data);
  } catch {
    return data;
  }
  if (json === undefined || !json.includes('"sale_price"')) return data;

  const plain = JSON.parse(json);
  walk(plain, privileged, now);
  return plain;
}

function walk(node: unknown, privileged: boolean, now: number): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, privileged, now);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const obj = node as Record<string, any>;

  // Mahsulot: bolalari hali tozalanmagan — xom qiymatlardan hisoblanadi
  if (Array.isArray(obj.characters)) Object.assign(obj, productPriceSummary(obj, now));

  if ('sale_price' in obj) {
    const active = isSaleActive(obj, now);
    if (privileged) {
      obj.sale_active = active;
    } else {
      if (!active) {
        obj.sale_price = null;
        obj.sale_ends_at = null;
      }
      delete obj.sale_starts_at;
    }
  }

  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === 'object') walk(value, privileged, now);
  }
}
