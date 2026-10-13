import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { ChatHub } from './chat-hub';
import { ChatFilesJobs } from './chat-files.jobs';
import { ChatFilesService } from './chat-files.service';
import { R2DocumentsStore } from 'src/seller_applications/r2-documents.store';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

/** Xaridor ↔ do'kon chati (topshiriq №34): REST + Socket.IO `/chat`; fayllar — №46. */
@Module({
  imports: [JwtModule.register({})],
  controllers: [ChatsController],
  providers: [ChatsService, ChatHub, ChatGateway, ChatFilesService, ChatFilesJobs, R2DocumentsStore],
})
export class ChatsModule {}
