import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  Query,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { CharacteristicsService } from './characteristics.service';
import { CreateCharacteristicDto } from './dto/create-characteristic.dto';
import { UpdateCharacteristicDto } from './dto/update-characteristic.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Characteristic } from './model/characteristic.model';
import { JwtOrServiceKeyGuard } from 'src/guards/jwt_or_service_key.guard';
import { parsePositiveIntParam } from 'src/common/helpers/pagination';
import { Throttle } from '@nestjs/throttler';

// MUHIM: nomiga qaramay, bu "model kartochkasi" — texnik xususiyat emas.
// `content` = rasm havolasi, `contentJson` = R2 dagi ProseMirror texnik
// hujjat (jadval). Product'ning HasMany "characters" bog'lanishi shu
// modelga ishora qiladi.
@ApiTags('Characteristics')
@Controller('characteristics')
export class CharacteristicsController {
  constructor(
    private readonly characteristicsService: CharacteristicsService,
  ) {}

  //Create characteristics
  @ApiOperation({ summary: 'Create characteristics' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  // `newCharacteristic` — asosiy kalit. `newBaner` eski nom (banner
  // modulidan qolgan), mijoz kodlari buzilmasligi uchun bir muddat
  // parallel qaytariladi; yangi integratsiyalar `newCharacteristic`
  // dan foydalansin.
  @ApiResponse({
    status: 201,
    description: 'Characteristic yaratildi',
    schema: {
      example: {
        message: 'Characteristic successfully created',
        newCharacteristic: { id: 305, title: 'VKPP 60-35', product_id: 50 },
        newBaner: { id: 305, title: 'VKPP 60-35', product_id: 50 },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "content/contentJson majburiy — ular R2 havolalari",
  })
  @UseGuards(JwtOrServiceKeyGuard)
  @Post('create')
  async create(@Body() createCharacteristicDto: CreateCharacteristicDto) {
    return this.characteristicsService.createCharacteristics(
      createCharacteristicDto,
    );
  }

  //Get all characteristics (page/limit ixtiyoriy)
  @ApiOperation({ summary: 'Get all characteristics' })
  @Get('all')
  async getAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<Characteristic[]> {
    return this.characteristicsService.getAllCharacteristics(
      parsePositiveIntParam(page, 'page'),
      parsePositiveIntParam(limit, 'limit'),
    );
  }

  //Get one characteristic
  @ApiOperation({ summary: 'Get one characteristic' })
  @Get('one/:id')
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<Characteristic> {
    return this.characteristicsService.getCharacteristicById(id);
  }

  // Model tanlanganini qayd qilish — OCHIQ endpoint (mehmonlar ham
  // mahsulot ko'radi). Analitika uchun: qaysi modellar ko'proq qiziqish
  // uyg'otyapti. IP boshiga daqiqasiga 40 ta — oddiy foydalanuvchi bir
  // sahifada bir necha model bosishi mumkin, lekin spam to'xtatiladi.
  @ApiOperation({ summary: 'Model tanlanganini sanash (views +1)' })
  @Throttle({ default: { limit: 40, ttl: 60 * 1000 } })
  @Post(':id/view')
  async countView(@Param('id', ParseIntPipe) id: number) {
    return this.characteristicsService.incrementViews(id);
  }

  //Update characteristic by id
  @ApiOperation({ summary: 'Update characteristic by id' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCharacteristicDto: UpdateCharacteristicDto,
  ) {
    return this.characteristicsService.updateCharacteristicById(
      id,
      updateCharacteristicDto,
    );
  }

  //Delete characteristic by id
  @ApiOperation({ summary: 'Delete characteristic by id' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id', ParseIntPipe) id: number) {
    return this.characteristicsService.deleteCharacteristicById(id);
  }
}
