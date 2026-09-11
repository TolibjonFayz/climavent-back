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
  Req,
} from '@nestjs/common';
import { CartItemsService } from './cart_items.service';
import { CreateCartItemDto } from './dto/create-cart_item.dto';
import { UpdateCartItemDto } from './dto/update-cart_item.dto';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CartItem } from './model/cart_item.model';
import { UserGuard } from 'src/guards/user.guard';
import { AdminOrStoreGuard } from 'src/guards/admin_or_store.guard';
import { scopedStoreId } from 'src/common/helpers/store-scope';

@ApiTags('Cart item')
@Controller('cart-items')
export class CartItemsController {
  constructor(private readonly cartItemsService: CartItemsService) {}

  //Create cart item — faqat savat egasi
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Creating cart item (owner or admin)' })
  @UseGuards(UserGuard)
  @Post('create')
  async create(
    @Body() createCartItemDto: CreateCartItemDto,
    @Req() req: any,
  ) {
    return this.cartItemsService.createCartItem(createCartItemDto, req.user);
  }

  // Get all cart items — servis kaliti, sayt admini yoki DO'KON TOKENI.
  // Do'kon admini faqat o'z mahsulotlariga tegishli savat qatorlarini
  // oladi (topshiriq №13, 6-band). Faqat O'QISH; yozish xaridor tokenida.
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @ApiOperation({
    summary: "Get all cart items (servis kaliti, admin yoki do'kon tokeni)",
  })
  @UseGuards(AdminOrStoreGuard)
  @Get('all')
  async getAll(@Req() req: any): Promise<CartItem[]> {
    return this.cartItemsService.getAllCartItems(scopedStoreId(req));
  }

  //Get cart item by id
  @ApiOperation({ summary: 'Get cart by id' })
  @Get('one/:id')
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<CartItem> {
    return this.cartItemsService.getCartItemById(id);
  }

  //Update cart item by id — faqat savat egasi yoki admin
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update cart item by id (owner or admin)' })
  @UseGuards(UserGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCartItemDto: UpdateCartItemDto,
    @Req() req: any,
  ) {
    return this.cartItemsService.updateCartItemById(
      id,
      updateCartItemDto,
      req.user,
    );
  }

  //Delete cart item by id — faqat savat egasi yoki admin
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete cart item by id (owner or admin)' })
  @UseGuards(UserGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.cartItemsService.deleteCartItemById(id, req.user);
  }
}
