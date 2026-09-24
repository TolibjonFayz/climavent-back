import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ChatActor, isServiceKey, resolveChatActor } from './chat-auth';
import { ChatsService } from './chats.service';
import { CreateChatDto, ReadChatDto, SendMessageDto } from './dto';

/**
 * Xaridor ↔ do'kon chati (topshiriq №34). Hammasi `Authorization: Bearer`:
 * xaridor tokeni — o'z suhbatlari; do'kon admini/xodimi — o'z do'koni;
 * superadmin (yoki servis kaliti) — faqat o'qish.
 *
 * Real vaqt — Socket.IO, namespace `/chat` (path `/socket.io`), `ChatGateway`.
 */
@ApiTags('Chats')
@ApiBearerAuth()
@Controller('chats')
export class ChatsController {
  constructor(
    private readonly chats: ChatsService,
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
    return this.chats.getOrCreate(await this.actor(req), dto.store_id);
  }

  @ApiOperation({ summary: "Suhbatlar ro'yxati (updated_at bo'yicha kamayish); superadmin `?store_id=`" })
  @SkipThrottle()
  @Get()
  async list(@Req() req: any, @Query('store_id') storeId?: string) {
    return this.chats.list(await this.actor(req), Number(storeId) || undefined);
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
    return this.chats.messages(await this.actor(req), id, Number(beforeId) || undefined, Number(limit) || undefined);
  }

  @ApiOperation({ summary: 'Xabar yuborish (idempotent: client_msg_id)' })
  @ApiResponse({ status: 201, description: 'Xabar obyekti' })
  @ApiResponse({ status: 429, description: 'Daqiqasiga 30 tadan ortiq' })
  @SkipThrottle()
  @Post(':id/messages')
  async send(@Param('id', ParseIntPipe) id: number, @Body() dto: SendMessageDto, @Req() req: any) {
    return this.chats.send(await this.actor(req), id, dto);
  }

  @ApiOperation({ summary: "O'qildi: shu tomonning *_last_read_id si" })
  @SkipThrottle()
  @HttpCode(200)
  @Post(':id/read')
  async read(@Param('id', ParseIntPipe) id: number, @Body() dto: ReadChatDto, @Req() req: any) {
    return this.chats.read(await this.actor(req), id, dto.last_message_id);
  }
}
