import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { R2Service } from './r2.service';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CreateR2Dto } from './dto/create-r2.dto';
import { UpdateR2Dto } from './dto/update-r2.dto';
import { v4 as uuidv4 } from 'uuid';

@ApiTags('R2')
@Controller('r2')
export class R2Controller {
  constructor(private readonly r2Service: R2Service) {}
  //Create R2 text
  @ApiOperation({ summary: 'Create new R2 file' })
  @Post('r2-upload')
  async testUpload(@Body() createR2Dto: CreateR2Dto): Promise<{
    success: boolean;
    key: string;
    url: string;
    message: string;
  }> {
    const testData = { message: createR2Dto.data };
    const uniqueId = uuidv4();
    const key = `climavent/${uniqueId}.json`;

    const url = await this.r2Service.uploadJson(key, testData);

    return {
      success: true,
      key: key,
      url: url,
      message: 'File successfully created',
    };
  }

  //Updaqte existing r2 text
  @ApiOperation({ summary: 'Update existing R2 file by key' })
  @Put('r2-update')
  async updateContent(@Body() updateDto: UpdateR2Dto): Promise<{
    success: boolean;
    key: string;
    url: string;
    message: string;
  }> {
    const testData = { message: updateDto.data };

    // Bir xil key bilan yangilash
    const url = await this.r2Service.updateJson(updateDto.key, testData);

    return {
      success: true,
      key: updateDto.key,
      url: url,
      message: 'Content successfully updated',
    };
  }

  //Get r2 text
  @ApiOperation({ summary: 'Get R2 file content by key' })
  @ApiQuery({
    name: 'key',
    description: "R2 key (fayl yo'li)",
    example: 'climavent/12345-abcd-6789.json',
    required: true,
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
