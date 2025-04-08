import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { SelectedToCheckoutService } from './selected_to_checkout.service';
import { CreateSelectedToCheckoutDto } from './dto/create-selected_to_checkout.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Selected to checkout')
@Controller('selected-to-checkout')
export class SelectedToCheckoutController {
  constructor(
    private readonly selectedToCheckoutService: SelectedToCheckoutService,
  ) {}

  //Create selected to checkout
  @ApiOperation({ summary: 'Create selected to checkout' })
  @Post('create')
  async create(
    @Body() createSelectedToCheckoutDto: CreateSelectedToCheckoutDto,
  ) {
    return this.selectedToCheckoutService.createSelectedToCh(
      createSelectedToCheckoutDto,
    );
  }

  //Get all selected to checkouts
  @ApiOperation({ summary: 'Get all selected to checkout' })
  @Get('all')
  async findAll() {
    return this.selectedToCheckoutService.getAllSelectedToCheckouts();
  }

  //Get selected to checkouts by user id
  @ApiOperation({ summary: 'Get selected to checkouts by user id' })
  @Get('byuser/:id')
  async findOne(@Param('id') id: number) {
    return this.selectedToCheckoutService.getUserCheckedOnes(id);
  }

  @ApiOperation({ summary: 'Delete selected to checkouts by user id' })
  @Delete('deletebyuser/:id')
  async remove(@Param('id') id: number) {
    return this.selectedToCheckoutService.deleteSelectedToCh(id);
  }

  @ApiOperation({
    summary: 'Delete selected to checkouts which are in the cart',
  })
  @Delete('deletecartitembyuser/:id')
  async removecartitem(@Param('id') id: number) {
    return this.selectedToCheckoutService.deleteSelectedToChInCart(id);
  }
}
