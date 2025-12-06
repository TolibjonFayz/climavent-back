import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CharacteristicsService } from './characteristics.service';
import { CreateCharacteristicDto } from './dto/create-characteristic.dto';
import { UpdateCharacteristicDto } from './dto/update-characteristic.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Characteristic } from './model/characteristic.model';

@ApiTags('Characteristics')
@Controller('characteristics')
export class CharacteristicsController {
  constructor(
    private readonly characteristicsService: CharacteristicsService,
  ) {}

  //Create characteristics
  @ApiOperation({ summary: 'Create characteristics' })
  @Post('create')
  async create(@Body() createCharacteristicDto: CreateCharacteristicDto) {
    return this.characteristicsService.createCharacteristics(
      createCharacteristicDto,
    );
  }

  //Get one characteristic
  @ApiOperation({ summary: 'Get one characteristic' })
  @Get('one/:id')
  async getOne(@Param('id') id: number): Promise<Characteristic> {
    return this.characteristicsService.getCharacteristicById(id);
  }

  //Update characteristic by id
  @ApiOperation({ summary: 'Update characteristic by id' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateCharacteristicDto: UpdateCharacteristicDto,
  ) {
    return this.characteristicsService.updateCharacteristicById(
      id,
      updateCharacteristicDto,
    );
  }

  //Delete characteristic by id
  @ApiOperation({ summary: 'Delete characteristic by id' })
  @Delete('delete/:id')
  async deleteOne(@Param('id') id: number) {
    return this.characteristicsService.deleteCharacteristicById(id);
  }
}
