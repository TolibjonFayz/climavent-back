import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CartItemsService } from './cart_items.service';
import { CreateCartItemDto } from './dto/create-cart_item.dto';
import { UpdateCartItemDto } from './dto/update-cart_item.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CartItem } from './model/cart_item.model';

@ApiTags('Cart item')
@Controller('cart-items')
export class CartItemsController {
  constructor(private readonly cartItemsService: CartItemsService) {}

  //Create cart item
  @ApiOperation({ summary: 'Creating cart item' })
  @Post('create')
  async create(@Body() createCartItemDto: CreateCartItemDto) {
    return this.cartItemsService.createCartItem(createCartItemDto);
  }

  //Get all cart items
  @ApiOperation({ summary: 'Get all cart items' })
  @Get('all')
  async getAll(): Promise<CartItem[]> {
    return this.cartItemsService.getAllCartItems();
  }

  //Get cart item by id
  @ApiOperation({ summary: 'Get cart by id' })
  @Get('one/:id')
  async getOne(@Param('id') id: number): Promise<CartItem> {
    return this.cartItemsService.getCartItemById(id);
  }

  //Update cart item by id
  @ApiOperation({ summary: 'Update cart item by id' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateCartItemDto: UpdateCartItemDto,
  ) {
    return this.cartItemsService.updateCartItemById(id, updateCartItemDto);
  }

  //Delete cart item by id
  @ApiOperation({ summary: 'Delete cart item by id' })
  @Delete('delete/:id')
  async deleteOne(@Param('id') id: number) {
    return this.cartItemsService.deleteCartItemById(id);
  }
}
