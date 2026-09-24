import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { ChatHub } from './chat-hub';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

/** Xaridor ↔ do'kon chati (topshiriq №34): REST + Socket.IO `/chat`. */
@Module({
  imports: [JwtModule.register({})],
  controllers: [ChatsController],
  providers: [ChatsService, ChatHub, ChatGateway],
})
export class ChatsModule {}
