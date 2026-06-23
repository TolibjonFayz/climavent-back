import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Cart } from './models/cart.model';
import { UserSelfGuard } from 'src/guards/user_self.guard';
import { UserSelfBodyGuard } from 'src/guards/user_self_body.guard';
import { AdminGuard } from 'src/guards/admin.guard';

@ApiTags('Cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  //Create cart — faqat o'z nomidan (body.user_id == token egasi)
  @ApiOperation({ summary: 'Creating cart (self)' })
  @UseGuards(UserSelfBodyGuard)
  @Post('create')
  async create(@Body() createCartDto: CreateCartDto) {
    return this.cartService.createCart(createCartDto);
  }

  //Get all carts — faqat admin (barcha foydalanuvchilar savatini ko'rsatadi)
  @ApiOperation({ summary: 'Get all carts (admin)' })
  @UseGuards(AdminGuard)
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

  //Get cart by user id — faqat o'sha foydalanuvchining o'zi
  @ApiOperation({ summary: 'Get cart by user id (self)' })
  @UseGuards(UserSelfGuard)
  @Get('oneuser/:id')
  async getOneByUserId(@Param('id') id: number): Promise<any> {
    return this.cartService.getCartByUserId(id);
  }

  //Update cart by id — frontend ishlatmaydi, faqat admin
  @ApiOperation({ summary: 'Update cart by id (admin)' })
  @UseGuards(AdminGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateCartDto: UpdateCartDto,
  ) {
    return this.cartService.updateCartById(id, updateCartDto);
  }

  //Delete cart by id — frontend ishlatmaydi, faqat admin
  @ApiOperation({ summary: 'Delete cart by id (admin)' })
  @UseGuards(AdminGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id') id: number) {
    return this.cartService.deleteCartById(id);
  }
}
