import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * `ViewerScopeMiddleware` qo'ygan bayroqni controller'ga uzatadi.
 *
 * `true` — adminka/bot (servis kaliti, admin JWT yoki do'kon tokeni):
 *          nofaol do'kon va yashirilgan mahsulot ham qaytadi.
 * `false` — mehmon (sayt): faqat ko'rinadigan mahsulotlar.
 */
export const Privileged = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): boolean =>
    ctx.switchToHttp().getRequest().isPrivileged === true,
);
