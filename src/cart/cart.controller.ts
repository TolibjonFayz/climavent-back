import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Cart } from './models/cart.model';

@ApiTags('Cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  //Create cart
  @ApiOperation({ summary: 'Creating cart' })
  @Post('create')
  async create(@Body() createCartDto: CreateCartDto) {
    return this.cartService.createCart(createCartDto);
  }

  //Get all carts
  @ApiOperation({ summary: 'Get all carts' })
  @Get('all')
  async getAll(): Promise<Cart[]> {
    return this.cartService.getAllCarts();
  }

  //Get cart by id
  @ApiOperation({ summary: 'Get cart by id' })
  @Get('one/:id')
  async getOne(@Param('id') id: number): Promise<Cart> {
    return this.cartService.getCartById(id);
  }

  //Get cart by user id
  @ApiOperation({ summary: 'Get cart by user id' })
  @Get('oneuser/:id')
  async getOneByUserId(@Param('id') id: number): Promise<Cart> {
    return this.cartService.getCartByUserId(id);
  }

  //Update cart by id
  @ApiOperation({ summary: 'Update cart by id' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateCartDto: UpdateCartDto,
  ) {
    return this.cartService.updateCartById(id, updateCartDto);
  }

  //Delete cart by id
  @ApiOperation({ summary: 'Delete cart by id' })
  @Delete('delete/:id')
  async deleteOne(@Param('id') id: number) {
    return this.cartService.deleteCartById(id);
  }
}
