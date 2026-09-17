import type { NextFunction, Request, Response } from 'express';

/**
 * Serverning o'zida ketgan vaqt (topshiriq №23, 3-savol).
 *
 * Har javobga `Server-Timing: app;dur=12.3` qo'yiladi — brauzer DevTools'ida
 * (Network → Timing) tarmoq vaqtidan alohida ko'rinadi. Shu bilan "sekinlik
 * serverdami yoki yo'ldami" degan savolga har so'rov bo'yicha javob bor.
 *
 * `Timing-Allow-Origin` — adminka JS'da `performance.getEntries()` orqali ham
 * o'qiy olsin. Sarlavhada maxfiy narsa yo'q, faqat millisekund.
 *
 * `SLOW_REQUEST_MS` (standart 1000) dan uzoq so'rovlar logga yoziladi.
 */
export function responseTime() {
  const slowMs = Number(process.env.SLOW_REQUEST_MS) || 1000;
  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    const writeHead = res.writeHead;
    res.writeHead = function (this: Response, ...args: any[]) {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      if (!res.headersSent) {
        res.setHeader('Server-Timing', `app;dur=${ms.toFixed(1)}`);
        res.setHeader('Timing-Allow-Origin', '*');
      }
      if (ms >= slowMs) {
        // So'rov yo'li so'rov parametrlarisiz: token yoki telefon logga tushmasin
        console.warn(`[sekin] ${req.method} ${String(req.originalUrl || req.url).split('?')[0]} ${res.statusCode} ${ms.toFixed(0)}ms`);
      }
      return (writeHead as any).apply(this, args);
    } as any;
    next();
  };
}
