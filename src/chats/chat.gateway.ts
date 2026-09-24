import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { ChatActor, resolveChatActor, storeCan } from './chat-auth';
import { ChatHub, clientRoom, storeRoom } from './chat-hub';
import { ChatsService } from './chats.service';

const TYPING_MIN_MS = 1000;

/**
 * Chat socketi (topshiriq №34, 3-band): `wss://<host>/chat`, path `/socket.io`.
 * Global `api` prefiksi gateway'ga ta'sir qilmaydi.
 *
 * Kirish: `handshake.auth.token` — oddiy access token. Yaroqsiz / muddati
 * o'tgan bo'lsa `connect_error: unauthorized` — ilova tokenni yangilab qayta
 * ulanadi. Xaridor `client:<id>`, do'kon admini/xodimi `store:<store_id>`
 * xonasiga qo'shiladi. Superadmin va kuryer socketga ulanmaydi (`forbidden`).
 *
 * Server faqat `typing` ni qabul qiladi; xabar yuborish — REST.
 */
@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
export class ChatGateway implements OnGatewayInit {
  private readonly logger = new Logger('ChatGateway');

  @WebSocketServer() server: Namespace;

  constructor(
    private readonly hub: ChatHub,
    private readonly chats: ChatsService,
    private readonly jwt: JwtService,
  ) {}

  afterInit(server: Namespace) {
    this.hub.server = server;
    server.use(async (socket: Socket, next) => {
      try {
        const token = socket.handshake.auth?.token ?? socket.handshake.headers?.authorization;
        const actor = await resolveChatActor(this.jwt, token as string);
        if (!actor) return next(new Error('unauthorized'));
        if (actor.kind === 'super' || (actor.kind === 'store' && !storeCan(actor, 'chat.view'))) {
          return next(new Error('forbidden'));
        }
        socket.data.actor = actor;
        socket.data.lastTyping = 0;
        await socket.join(actor.kind === 'client' ? clientRoom(actor.user_id) : storeRoom(actor.store_id));
        next();
      } catch (e) {
        this.logger.warn(`Socket kirishida xato: ${(e as Error).message}`);
        next(new Error('unauthorized'));
      }
    });
  }

  @SubscribeMessage('typing')
  async typing(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    const actor: ChatActor | undefined = socket.data.actor;
    const chatId = Number(body?.chat_id);
    if (!actor || !Number.isInteger(chatId) || chatId <= 0) return;
    const now = Date.now();
    if (now - Number(socket.data.lastTyping || 0) < TYPING_MIN_MS) return;
    socket.data.lastTyping = now;
    const target = await this.chats.typingTarget(actor, chatId);
    if (target) this.server.to(target.room).emit('typing', { chat_id: chatId, from: target.from });
  }
}
