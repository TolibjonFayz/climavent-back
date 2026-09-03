import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { R2Service } from './r2.service';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CreateR2Dto } from './dto/create-r2.dto';
import { UpdateR2Dto } from './dto/update-r2.dto';
import { JwtOrServiceKeyGuard } from 'src/guards/jwt_or_service_key.guard';

@ApiTags('R2')
@Controller('r2')
export class R2Controller {
  constructor(private readonly r2Service: R2Service) {}

  //Create R2 text
  @ApiOperation({ summary: 'Create new R2 file' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiResponse({
    status: 201,
    description:
      "Fayl yaratildi. `data` nima berilgan bo'lsa, o'sha yoziladi",
    schema: {
      example: {
        success: true,
        key: 'climavent/12345-abcd.json',
        url: 'https://pub-xxx.r2.dev/climavent/12345-abcd.json',
        message: 'File successfully created',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "`data` majburiy va bo'sh bo'lmasligi kerak",
  })
  @UseGuards(JwtOrServiceKeyGuard)
  @Post('r2-upload')
  async testUpload(@Body() createR2Dto: CreateR2Dto): Promise<{
    success: boolean;
    key: string;
    url: string;
    message: string;
  }> {
    // Nima berilgan bo'lsa — O'SHA yoziladi. Ilgari bu yerda mazmun
    // `{ message: ... }` ichiga o'ralardi, ustiga `data` esa
    // ValidationPipe(whitelist) tomonidan o'chirilib, faylga bo'sh `{}`
    // tushardi. Ikkalasi ham tuzatildi.
    const key = this.r2Service.buildJsonKey();
    const url = await this.r2Service.uploadJson(key, createR2Dto.data);

    return {
      success: true,
      key,
      url,
      message: 'File successfully created',
    };
  }

  //Updaqte existing r2 text
  @ApiOperation({ summary: 'Update existing R2 file by key' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiResponse({
    status: 200,
    description: "Yangilandi (o'ramasiz — berilgan mazmun aynan yoziladi)",
    schema: {
      example: {
        success: true,
        key: 'climavent/12345-abcd.json',
        url: 'https://pub-xxx.r2.dev/climavent/12345-abcd.json?v=1756800000000',
        message: 'Content successfully updated',
      },
    },
  })
  @UseGuards(JwtOrServiceKeyGuard)
  @Put('r2-update')
  async updateContent(@Body() updateDto: UpdateR2Dto): Promise<{
    success: boolean;
    key: string;
    url: string;
    message: string;
  }> {
    // O'ramasiz: berilgan mazmun aynan shu holida yoziladi.
    const url = await this.r2Service.updateJson(updateDto.key, updateDto.data);

    return {
      success: true,
      key: updateDto.key,
      url: url,
      message: 'Content successfully updated',
    };
  }

  //R2 obyektini o'chirish.
  //DIQQAT: kalitda "/" bo'lgani uchun (`climavent/<uuid>.json`) yo'l
  //parametri (`:key`) mos kelmaydi — shuning uchun `?key=` so'rov
  //parametri ishlatiladi, xuddi `r2-content` dagidek.
  @ApiOperation({ summary: "R2 faylini kalit bo'yicha o'chirish" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiQuery({ name: 'key', example: 'climavent/12345-abcd.json', required: true })
  @ApiResponse({
    status: 200,
    description: "O'chirildi",
    schema: {
      example: { success: true, key: 'climavent/12345-abcd.json', message: "Fayl o'chirildi" },
    },
  })
  @UseGuards(JwtOrServiceKeyGuard)
  @Delete('r2-object')
  async deleteObject(@Query('key') key: string): Promise<{
    success: boolean;
    key: string;
    message: string;
  }> {
    if (!key) {
      throw new BadRequestException('key parametri majburiy');
    }
    await this.r2Service.deleteFile(key);
    return { success: true, key, message: "Fayl o'chirildi" };
  }

  //Get r2 text
  @ApiOperation({ summary: 'Get R2 file content by key' })
  @ApiQuery({
    name: 'key',
    description: "R2 key (fayl yo'li)",
    example: 'climavent/12345-abcd-6789.json',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: "Fayl mazmuni (`data` — nima yozilgan bo'lsa, o'sha)",
    schema: {
      example: {
        success: true,
        key: 'climavent/12345-abcd.json',
        data: { type: 'doc', content: [] },
        message: 'Content successfully retrieved',
      },
    },
  })
  @Get('r2-content')
  async getContent(@Query('key') key: string): Promise<{
    success: boolean;
    key: string;
    data: any;
    message: string;
  }> {
    if (!key) {
      throw new Error('key parametri majburiy');
    }

    const data = await this.r2Service.getJson(key);

    return {
      success: true,
      key: key,
      data: data,
      message: 'Content successfully retrieved',
    };
  }
}
