import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Viewer } from '../middleware/viewer_scope.middleware';

/** `ViewerScopeMiddleware` aniqlagan so'rov egasi (mehmon — kind: null). */
export const CurrentViewer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Viewer =>
    ctx.switchToHttp().getRequest().viewer ?? { kind: null, store_id: null },
);
