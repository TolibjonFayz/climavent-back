import {
  ArgumentsHost,
  Body,
  CanActivate,
  Catch,
  Controller,
  ExceptionFilter,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  Param,
  ParseIntPipe,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ChatActor, isServiceKey, resolveChatActor } from './chat-auth';
import { CHAT_FILE_MAX_BYTES, contentDisposition, isInline, verifyFileToken } from './chat-files';
import { ChatFilesService } from './chat-files.service';
import { ChatsService } from './chats.service';
import { CreateChatDto, ReadChatDto, SendMessageDto } from './dto';

/** Havolalar uchun API manzili: `PUBLIC_API_URL` yoki so'rovning o'zi (Railway: trust proxy 2 → https). */
const apiBase = (req: any): string =>
  (process.env.PUBLIC_API_URL || '').replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;

/**
 * Fayl yuklashda so'rovchi MULTER'DAN OLDIN aniqlanadi: begona token bilan
 * 25 MB xotiraga o'qilmasin. Natija `req.chatActor` da.
 */
@Injectable()
class ChatActorGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    if (isServiceKey(req.headers?.['x-api-key'])) {
      req.chatActor = { kind: 'super' };
      return true;
    }
    const a = await resolveChatActor(this.jwt, req.headers?.authorization);
    if (!a) throw new UnauthorizedException('Token yaroqsiz yoki bu hisob chatga kira olmaydi');
    req.chatActor = a;
    return true;
  }
}

/** Multer hajm chegarasi (413) — topshiriqdagi matn bilan. */
@Catch(PayloadTooLargeException)
class UploadTooLargeFilter implements ExceptionFilter {
  catch(_e: PayloadTooLargeException, host: ArgumentsHost) {
    host.switchToHttp().getResponse().status(413).json({ statusCode: 413, message: 'Fayl 25 MB dan katta' });
  }
}

/**
 * Xaridor ↔ do'kon chati (topshiriq №34). Hammasi `Authorization: Bearer`:
 * xaridor tokeni — o'z suhbatlari; do'kon admini/xodimi — o'z do'koni;
 * superadmin (yoki servis kaliti) — faqat o'qish.
 *
 * Real vaqt — Socket.IO, namespace `/chat` (path `/socket.io`), `ChatGateway`.
 * Fayllar (№46) — `POST :id/attachments`, berish — `GET files/:token`.
 */
@ApiTags('Chats')
@ApiBearerAuth()
@Controller('chats')
export class ChatsController {
  constructor(
    private readonly chats: ChatsService,
    private readonly files: ChatFilesService,
    private readonly jwt: JwtService,
  ) {}

  private async actor(req: any): Promise<ChatActor> {
    if (isServiceKey(req.headers?.['x-api-key'])) return { kind: 'super' };
    const a = await resolveChatActor(this.jwt, req.headers?.authorization);
    if (!a) throw new UnauthorizedException('Token yaroqsiz yoki bu hisob chatga kira olmaydi');
    return a;
  }

  @ApiOperation({ summary: "Suhbat (get-or-create) — xaridor, `{ store_id }`" })
  @ApiResponse({ status: 201, description: 'Suhbat obyekti; bor bo\'lsa o\'sha qaytadi' })
  @Post()
  async create(@Body() dto: CreateChatDto, @Req() req: any) {
    return this.chats.getOrCreate(await this.actor(req), dto.store_id, apiBase(req));
  }

  @ApiOperation({ summary: "Suhbatlar ro'yxati (updated_at bo'yicha kamayish); superadmin `?store_id=`" })
  @SkipThrottle()
  @Get()
  async list(@Req() req: any, @Query('store_id') storeId?: string) {
    return this.chats.list(await this.actor(req), apiBase(req), Number(storeId) || undefined);
  }

  @ApiOperation({ summary: 'Xabarlar — yangidan eskiga; `before_id` — undan eskilari' })
  @SkipThrottle()
  @Get(':id/messages')
  async messages(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Query('before_id') beforeId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chats.messages(
      await this.actor(req),
      id,
      apiBase(req),
      Number(beforeId) || undefined,
      Number(limit) || undefined,
    );
  }

  @ApiOperation({ summary: 'Xabar yuborish (idempotent: client_msg_id); `attachment_ids` — 0–10 ta' })
  @ApiResponse({ status: 201, description: 'Xabar obyekti' })
  @ApiResponse({ status: 429, description: 'Daqiqasiga 30 tadan ortiq' })
  @SkipThrottle()
  @Post(':id/messages')
  async send(@Param('id', ParseIntPipe) id: number, @Body() dto: SendMessageDto, @Req() req: any) {
    return this.chats.send(await this.actor(req), id, dto, apiBase(req));
  }

  @ApiOperation({ summary: 'Fayl yuklash (№46): bitta fayl, ≤ 25 MB, bajariladiganlar rad etiladi' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: '{ id, kind, name, mime, size, width, height, url, thumb_url }' })
  @ApiResponse({ status: 413, description: 'Fayl 25 MB dan katta' })
  @ApiResponse({ status: 415, description: 'Bajariladigan fayl' })
  @ApiResponse({ status: 429, description: 'Daqiqasiga 20 ta yoki kuniga 500 MB' })
  @SkipThrottle()
  @Post(':id/attachments')
  @UseGuards(ChatActorGuard)
  @UseFilters(UploadTooLargeFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CHAT_FILE_MAX_BYTES, files: 1 } }))
  async upload(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
    return this.chats.upload(req.chatActor, id, file, apiBase(req));
  }

  /**
   * Imzoli havola (24 soat) — tokensiz: `<img>`, `<video>` va ilovalar to'g'ridan
   * ochadi. Muddati o'tgan — 403 (mijoz xabarlarni qayta so'rab yangisini oladi).
   * Oxiridagi `/:name` — faqat chiroyli nom uchun, tekshirilmaydi.
   */
  @ApiOperation({ summary: 'Chat fayli (imzoli havola orqali)' })
  @SkipThrottle()
  @Get(['files/:token', 'files/:token/:name'])
  async file(@Param('token') token: string, @Req() req: any, @Res() res: Response) {
    const fail = (status: number, message: string) => res.status(status).json({ statusCode: status, message });
    const check = verifyFileToken(token);
    if (check.ok === false) {
      return check.reason === 'expired' ? fail(403, "Havola muddati o'tgan") : fail(404, 'Fayl topilmadi');
    }
    const a = await this.files.meta(check.id);
    const thumb = check.variant === 'thumb';
    if (!a || (thumb && !a.has_thumb)) return fail(404, 'Fayl topilmadi');

    const inline = thumb || isInline(a.kind, a.mime);
    // SVG/HTML va boshqa «fayl»lar faqat yuklab olinadi — brauzer ularni sahifa sifatida ochmaydi
    const unsafe = /^(image\/svg|text\/html)/.test(a.mime);
    res.setHeader('Content-Type', thumb ? 'image/webp' : unsafe ? 'application/octet-stream' : a.mime);
    res.setHeader('Content-Disposition', contentDisposition(inline ? 'inline' : 'attachment', thumb ? 'thumb.webp' : a.name));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Accept-Ranges', 'bytes');
    // Mazmuni magic-bytes bilan tekshirilgan rasm/video/audio/PDF: qattiq CSP brauzerning
    // o'z ko'ruvchisini (PDF, video sahifasi) buzadi. Yuklab olinadiganlarga — eng qattiq CSP
    // (helmet'nikiga tayanmaymiz: Swagger yoqilganda u o'chadi).
    if (inline) res.removeHeader('Content-Security-Policy');
    else res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

    const range = !thumb && typeof req.headers.range === 'string' ? req.headers.range : undefined;
    if (a.storage === 'db') {
      const buf = await this.files.blob(Number(a.id), check.variant);
      if (!buf) return fail(404, 'Fayl topilmadi');
      const r = range ? parseRange(range, buf.length) : null;
      if (r === 'invalid') {
        res.setHeader('Content-Range', `bytes */${buf.length}`);
        return fail(416, "Noto'g'ri Range");
      }
      if (r) {
        res.status(206).setHeader('Content-Range', `bytes ${r.start}-${r.end}/${buf.length}`);
        res.setHeader('Content-Length', String(r.end - r.start + 1));
        return res.end(buf.subarray(r.start, r.end + 1));
      }
      res.setHeader('Content-Length', String(buf.length));
      return res.end(buf);
    }
    try {
      const obj = await this.files.openR2(thumb ? a.thumb_key : a.file_key, range);
      if (!obj) return fail(404, 'Fayl topilmadi');
      if (obj.contentRange) res.status(206).setHeader('Content-Range', obj.contentRange);
      res.setHeader('Content-Length', String(obj.length));
      obj.stream.pipe(res);
    } catch (e: any) {
      if (e?.$metadata?.httpStatusCode === 416) {
        res.setHeader('Content-Range', `bytes */${a.size}`);
        return fail(416, "Noto'g'ri Range");
      }
      throw e;
    }
  }

  @ApiOperation({ summary: "O'qildi: shu tomonning *_last_read_id si" })
  @SkipThrottle()
  @HttpCode(200)
  @Post(':id/read')
  async read(@Param('id', ParseIntPipe) id: number, @Body() dto: ReadChatDto, @Req() req: any) {
    return this.chats.read(await this.actor(req), id, dto.last_message_id);
  }
}

/** `bytes=a-b` (bitta oraliq). Yaroqsiz — 'invalid', tushunarsiz/ko'p oraliq — null (butun fayl). */
function parseRange(header: string, size: number): { start: number; end: number } | 'invalid' | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    if (m[2] === '') return 'invalid';
    start = Math.max(size - Number(m[2]), 0);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}
