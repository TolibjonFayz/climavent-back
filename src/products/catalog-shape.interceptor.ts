import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { LIST_EXCLUDED_PRODUCT_ATTRS } from './catalog-plain';

/**
 * `products/all` javobining ixtiyoriy shakllari (topshiriq №51, 2- va 3-band).
 * Parametrsiz so'rovga TEGILMAYDI.
 *
 *   `?compact=1`   — `characters` va `insides` ichida qiymati `null` kalitlar
 *                    tashlanadi, `insides[].createdAt/updatedAt` qaytmaydi.
 *   `?view=list`   — `characters`, `reviews` va og'ir matn maydonlari (sizes,
 *                    opisaniya, naznacheniya, markirovka + *Json) qaytmaydi;
 *                    o'rniga `models_count`, `variants_count`.
 *
 * NEGA ALOHIDA INTERCEPTOR: narx maydonlari (`min_price`, `on_sale`, `price_uzs`,
 * mehmondan yashiriladigan aksiya) `SalePresentationInterceptor` da
 * `characters` dan hisoblanadi. Shakl o'shandan KEYIN o'zgartirilishi kerak —
 * shuning uchun bu interceptor `main.ts` da undan OLDIN (tashqi qavat)
 * ro'yxatdan o'tadi: javob avval narxdan, keyin shu yerdan o'tadi.
 *
 * Controller so'rovga `req.catalogShape` qo'yadi; u bo'lmasa hech narsa qilinmaydi.
 */
export interface CatalogShape {
  compact: boolean;
  list: boolean;
}

@Injectable()
export class CatalogShapeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    return next.handle().pipe(
      map((data) => {
        const shape: CatalogShape | undefined = req.catalogShape;
        if (!shape || (!shape.compact && !shape.list) || !Array.isArray(data)) return data;
        return data.map((p) => shapeProduct(p, shape));
      }),
    );
  }
}

const LIST_DROP = ['characters', 'reviews', ...LIST_EXCLUDED_PRODUCT_ATTRS];

export function shapeProduct(p: any, shape: CatalogShape): any {
  if (p === null || typeof p !== 'object') return p;
  if (shape.list) {
    const chars: any[] = Array.isArray(p.characters) ? p.characters : [];
    const out: Record<string, any> = {};
    for (const key of Object.keys(p)) {
      if (!LIST_DROP.includes(key)) out[key] = p[key];
    }
    out.models_count = chars.length;
    out.variants_count = chars.reduce((n, c) => n + (Array.isArray(c?.insides) ? c.insides.length : 0), 0);
    return out;
  }
  if (shape.compact && Array.isArray(p.characters)) {
    p.characters = p.characters.map((c: any) => {
      const co = dropNulls(c);
      if (Array.isArray(co.insides)) {
        co.insides = co.insides.map((i: any) => {
          const io = dropNulls(i);
          delete io.createdAt;
          delete io.updatedAt;
          return io;
        });
      }
      return co;
    });
  }
  return p;
}

function dropNulls(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  const out: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== null) out[key] = obj[key];
  }
  return out;
}
