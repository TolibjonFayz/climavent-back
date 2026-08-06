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
import { SelectedToCheckoutService } from './selected_to_checkout.service';
import { CreateSelectedToCheckoutDto } from './dto/create-selected_to_checkout.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserSelfGuard } from 'src/guards/user_self.guard';
import { AdminGuard } from 'src/guards/admin.guard';

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

  //Get all selected to checkouts — faqat admin
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all selected to checkout (admin)' })
  @UseGuards(AdminGuard)
  @Get('all')
  async findAll() {
    return this.selectedToCheckoutService.getAllSelectedToCheckouts();
  }

  //Get selected to checkouts by user id — faqat o'sha foydalanuvchi
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get selected to checkouts by user id (self)' })
  @UseGuards(UserSelfGuard)
  @Get('byuser/:id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.selectedToCheckoutService.getUserCheckedOnes(id);
  }

  //Delete by user id — faqat o'sha foydalanuvchi
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete selected to checkouts by user id (self)' })
  @UseGuards(UserSelfGuard)
  @Delete('deletebyuser/:id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.selectedToCheckoutService.deleteSelectedToCh(id);
  }

  //Delete cart items by user id — faqat o'sha foydalanuvchi
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete selected to checkouts which are in the cart (self)',
  })
  @UseGuards(UserSelfGuard)
  @Delete('deletecartitembyuser/:id')
  async removecartitem(@Param('id', ParseIntPipe) id: number) {
    return this.selectedToCheckoutService.deleteSelectedToChInCart(id);
  }
}
