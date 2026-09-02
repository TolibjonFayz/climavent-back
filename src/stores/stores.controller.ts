import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StoresService } from './stores.service';
import { Store } from './model/store.model';

@ApiTags('Stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @ApiOperation({ summary: "Do'konlar ro'yxati" })
  @ApiResponse({ status: 200, description: "Do'konlar", type: [Store] })
  @Get('all')
  async getAll(): Promise<Store[]> {
    return this.storesService.getAll();
  }
}
