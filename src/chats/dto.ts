import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

// DIQQAT: global ValidationPipe `whitelist: true` — validator dekoratorisiz
// maydon JIMGINA o'chadi. Har maydonda validator bor.

export class CreateChatDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  store_id: number;
}

export class SendMessageDto {
  @ApiProperty({ required: false, example: "Salom, 12 dona bo'lsa narx qancha bo'ladi?" })
  @IsOptional()
  @IsString()
  // HTML olib tashlanib, trim qilingandan keyin 2000 — bu yerda xom chegarasi
  @MaxLength(6000)
  text?: string;

  @ApiProperty({ required: false, example: 158 })
  @IsOptional()
  @IsInt()
  @Min(1)
  product_id?: number;

  @ApiProperty({ required: false, example: '5f0c1c3e-7a2b-4c1d-9e8f-0a1b2c3d4e5f' })
  @IsOptional()
  @IsUUID('all')
  client_msg_id?: string;
}

export class ReadChatDto {
  @ApiProperty({ example: 301 })
  @IsInt()
  @Min(0)
  last_message_id: number;
}
