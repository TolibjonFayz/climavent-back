import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class StoreLoginDto {
  @ApiProperty({ example: 'jihozvent_admin' })
  @IsString()
  @IsNotEmpty()
  login: string;

  @ApiProperty({ example: 'kuchli-parol-123' })
  @IsString()
  @IsNotEmpty()
  password: string;

  // `mobile` — ilova: 15 daqiqalik access + 60 kunlik refresh (topshiriq №22, 8-band).
  // Adminka (veb) yubormaydi va avvalgidek 12 soatlik tokenda qoladi.
  @ApiProperty({ example: 'mobile', required: false, enum: ['web', 'mobile'] })
  @IsOptional()
  @IsIn(['web', 'mobile'])
  client?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ example: 'b64url…' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  refresh_token: string;
}

export class LogoutDto {
  @ApiProperty({ required: false, description: 'Mobil ilova: shu qurilmaning refresh tokeni bekor qilinadi' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refresh_token?: string;
}
