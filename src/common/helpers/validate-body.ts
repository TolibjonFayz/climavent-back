import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

/**
 * Tanasi RO'YXAT bo'lgan endpointlar (`PUT /services/:id/links [..]`,
 * `PUT /stores/:id/service-areas [..]`) uchun tekshiruv.
 *
 * Global `ValidationPipe` klass bo'lmagan tanani (massivni) tekshirmaydi,
 * shuning uchun ro'yxat `{ [key]: [...] }` ko'rinishiga o'raladi va global
 * sozlamalar bilan (whitelist, forbid yo'q, implicit conversion) tekshiriladi.
 * Ikkala shakl ham qabul qilinadi: `[...]` yoki `{ key: [...] }`.
 */
export async function validateListBody<T extends object>(cls: new () => T, key: string, body: unknown): Promise<T> {
  const list = Array.isArray(body) ? body : (body as any)?.[key];
  if (!Array.isArray(list)) throw new BadRequestException(`Tana ro'yxat bo'lsin: [...] yoki { "${key}": [...] }`);
  const instance = plainToInstance(cls, { [key]: list }, { enableImplicitConversion: true });
  const errors = await validate(instance as object, { whitelist: true });
  if (errors.length) throw new BadRequestException(flatten(errors));
  return instance;
}

function flatten(errors: ValidationError[], prefix = ''): string[] {
  const out: string[] = [];
  for (const e of errors) {
    const path = prefix ? `${prefix}.${e.property}` : e.property;
    if (e.constraints) out.push(...Object.values(e.constraints).map((m) => `${path}: ${m}`));
    if (e.children?.length) out.push(...flatten(e.children, path));
  }
  return out;
}
