// src/r2/dto/update-r2.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsNotEmpty, IsString } from 'class-validator';

export class UpdateR2Dto {
  @ApiProperty({
    description: "R2 key (fayl yo'li/nomi)",
    example: 'climavent/12345-abcd-6789.json',
    required: true,
  })
  @IsNotEmpty({ message: 'key majburiy' })
  @IsString()
  key: string;

  @ApiProperty({
    description: "Yangilangan ma'lumot",
    example: 'Updated message content',
    required: true,
  })
  // `whitelist: true` validatorsiz maydonni o'chirib tashlaydi — shuning
  // uchun bu dekoratorlar shart (CreateR2Dto dagi xato aynan shundan edi).
  @IsDefined({ message: 'data majburiy' })
  @IsNotEmpty({ message: "data bo'sh bo'lmasligi kerak" })
  data: any;
}
