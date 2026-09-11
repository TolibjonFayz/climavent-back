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
import { CartService } from './cart.service';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Cart } from './models/cart.model';
import { UserSelfGuard } from 'src/guards/user_self.guard';
import { CustomerOrBackofficeGuard } from 'src/guards/customer_or_backoffice.guard';
import { UserSelfOrBackofficeGuard } from 'src/guards/user_self_or_backoffice.guard';
import { UserSelfBodyGuard } from 'src/guards/user_self_body.guard';
import { AdminGuard } from 'src/guards/admin.guard';
import { JwtOrServiceKeyGuard } from 'src/guards/jwt_or_service_key.guard';

@ApiTags('Cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  //Create cart — faqat o'z nomidan (body.user_id == token egasi)
  @ApiOperation({ summary: 'Creating cart (self)' })
  @ApiBearerAuth()
  @UseGuards(UserSelfBodyGuard)
  @Post('create')
  async create(@Body() createCartDto: CreateCartDto) {
    return this.cartService.createCart(createCartDto);
  }

  // Get all carts — admin JWT YOKI servis kaliti (topshiriq №11, 1-band).
  // Adminka do'kon kabineti, mijoz kabineti emas: unda xaridor JWT si
  // yo'q va bo'lishi ham kerak emas. YOZISH endpointlari tegilmadi —
  // ular xaridor tokenida qoladi.
  @ApiOperation({ summary: 'Get all carts (admin or service key)' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(JwtOrServiceKeyGuard)
  @Get('all')
  async getAll(): Promise<Cart[]> {
    return this.cartService.getAllCarts();
  }

  // Get cart by id — savat egasi yoki superadmin. Ilgari ochiq edi va
  // mijozning shaxsiy ma'lumotini tokensiz qaytarardi.
  @ApiOperation({ summary: 'Get cart by id (egasi yoki superadmin)' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(CustomerOrBackofficeGuard)
  @Get('one/:id')
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ): Promise<Cart> {
    return this.cartService.getCartById(id, req.actor);
  }

  //Get cart by user id — faqat o'sha foydalanuvchining o'zi
  @ApiOperation({ summary: 'Get cart by user id (self)' })
  @ApiBearerAuth()
    // Mijozning o'zi YOKI orqa ofis (servis kaliti, sayt admini) —
  // adminkaning mijoz sahifasi uchun (topshiriq №13, 1-band).
  @ApiSecurity('service-key')
  @UseGuards(UserSelfOrBackofficeGuard)
  @Get('oneuser/:id')
  async getOneByUserId(@Param('id', ParseIntPipe) id: number): Promise<any> {
    return this.cartService.getCartByUserId(id);
  }

  //Update cart by id — frontend ishlatmaydi, faqat admin
  @ApiOperation({ summary: 'Update cart by id (admin)' })
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCartDto: UpdateCartDto,
  ) {
    return this.cartService.updateCartById(id, updateCartDto);
  }

  //Delete cart by id — frontend ishlatmaydi, faqat admin
  @ApiOperation({ summary: 'Delete cart by id (admin)' })
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id', ParseIntPipe) id: number) {
    return this.cartService.deleteCartById(id);
  }
}
