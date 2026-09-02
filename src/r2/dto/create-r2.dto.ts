import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsNotEmpty } from 'class-validator';

export class CreateR2Dto {
  @ApiProperty({
    description:
      "R2 ga yoziladigan mazmun. Matn (HTML) yoki obyekt (ProseMirror " +
      "hujjati) bo'lishi mumkin — nima berilsa, o'shaning o'zi yoziladi.",
    example: '<p>Mahsulot tavsifi</p>',
  })
  // DIQQAT: bu dekoratorlar SHART. Global ValidationPipe `whitelist: true`
  // bilan ishlaydi va validatorsiz maydonlarni tanadan O'CHIRIB tashlaydi.
  // Aynan shu sabab `data` undefined bo'lib, R2 ga bo'sh `{}` yozilardi.
  @IsDefined({ message: 'data majburiy' })
  @IsNotEmpty({ message: "data bo'sh bo'lmasligi kerak" })
  data: any;
}
