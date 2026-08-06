import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { RishotkalarService } from './rishotkalar.service';
import { CreateRishotkalarDto } from './dto/create-rishotkalar.dto';
import { UpdateRishotkalarDto } from './dto/update-rishotkalar.dto';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Rishotkalar } from './models/rishotkalar.model';
import { JwtOrServiceKeyGuard } from 'src/guards/jwt_or_service_key.guard';

@ApiTags('Rishotkalar')
@Controller('rishotkalar')
export class RishotkalarController {
  constructor(private readonly rishotkalarService: RishotkalarService) {}

  //Create rishotka
  @ApiOperation({ summary: 'Creating rishotka' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Post('create')
  create(@Body() createRishotkalarDto: CreateRishotkalarDto) {
    return this.rishotkalarService.create(createRishotkalarDto);
  }

  //Get all rishotkalar
  @ApiOperation({ summary: 'Get all rishotkalar' })
  @Get('all')
  async getAll(): Promise<Rishotkalar[]> {
    return this.rishotkalarService.getAllRishotkalar();
  }

  //Get rishotkalar by its id
  @ApiOperation({ summary: 'Get rishotka by its id' })
  @Get('one/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rishotkalarService.getOneRishotkaById(id);
  }

  //Update rishotka by its id
  @ApiOperation({ summary: 'Update rishotka by id' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRishotkaDto: UpdateRishotkalarDto,
  ) {
    return this.rishotkalarService.updateRishotkaById(id, updateRishotkaDto);
  }

  //Delete product review by id
  @ApiOperation({ summary: 'Delete rishotka by id' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id', ParseIntPipe) id: number) {
    return this.rishotkalarService.deleteRishotkaById(id);
  }
}
