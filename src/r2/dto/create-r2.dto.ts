import { ApiProperty } from '@nestjs/swagger';

export class CreateR2Dto {
  @ApiProperty({
    example: 'Very quality, I am using with pleasure',
    description: 'Review for the product',
  })
  data: string;
}
