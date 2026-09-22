import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { catalogScope, CatalogScope } from '../visibility/catalog-visibility';

/**
 * Katalog ko'rinuvchanligi doirasi (topshiriq №29, 1-band).
 * Qoidalar — `common/visibility/catalog-visibility.ts`.
 */
export const Scope = createParamDecorator((_d: unknown, ctx: ExecutionContext): CatalogScope =>
  catalogScope(ctx.switchToHttp().getRequest().viewer),
);

/**
 * FAQAT ataylab adminka uchun mo'ljallangan endpointlarda (`products/alladmin`,
 * `products/one/:id`): sayt admini (`users.is_admin`) tokeni ham hammasini
 * ko'radi. Eski Vue adminka store-auth ga ko'chmaguncha kerak.
 */
export const AdminScope = createParamDecorator((_d: unknown, ctx: ExecutionContext): CatalogScope =>
  catalogScope(ctx.switchToHttp().getRequest().viewer, { siteAdminSeesAll: true }),
);
