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
  Query,
  Req,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Order } from './model/order.model';
import { AdminOrStoreGuard } from 'src/guards/admin_or_store.guard';
import { scopedStoreId } from 'src/common/helpers/store-scope';
import { UserGuard } from 'src/guards/user.guard';
import { UserSelfGuard } from 'src/guards/user_self.guard';
import { UserSelfOrBackofficeGuard } from 'src/guards/user_self_or_backoffice.guard';
import { CustomerOrBackofficeGuard } from 'src/guards/customer_or_backoffice.guard';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  //Create order — foydalanuvchi login qilgan bo'lishi kerak
  @ApiOperation({ summary: 'Creating order' })
  @UseGuards(UserGuard)
  @Post('create')
  async create(@Body() createOrderDto: CreateOrderDto, @Req() req: any) {
    return this.ordersService.createOrder(createOrderDto, req.user);
  }

  //Get all orders — admin JWT yoki servis kaliti (X-API-Key).
  //Servis kalitiga FAQAT o'qish berilgan: yozish endpointlari admin/user
  //guvohnomasida qoladi. Bu adminka daromad analitikasi uchun kerak.
  // Do'kon tokeni ham qabul qilinadi — u holda faqat o'sha do'kon
  // mahsuloti bor buyurtmalar qaytadi (topshiriq №13, 6-band).
  @ApiOperation({
    summary: "Get all orders (servis kaliti, admin yoki do'kon tokeni)",
  })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(AdminOrStoreGuard)
  @Get('all')
  async getAll(@Req() req: any, @Query('kind') kind?: string): Promise<Order[]> {
    // `?kind=quote` — faqat KP so'rovlari, `?kind=order` — oddiy buyurtmalar (№21)
    return this.ordersService.getAllOrders(scopedStoreId(req), kind);
  }

  //Get order by id
  @ApiOperation({ summary: 'Get order by id' })
  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Get('one/:id')
  async getOne(@Param('id', ParseIntPipe) id: number, @Req() req: any): Promise<Order> {
    return this.ordersService.getOrderById(id, req.user);
  }

  //Get order by user id — foydalanuvchi faqat o'zinikini ko'radi
  @ApiOperation({ summary: 'Get order by user id' })
  @ApiBearerAuth()
    // Mijozning o'zi YOKI orqa ofis (servis kaliti, sayt admini) —
  // adminkaning mijoz sahifasi uchun (topshiriq №13, 1-band).
  @ApiSecurity('service-key')
  @UseGuards(UserSelfOrBackofficeGuard)
  @Get('oneuser/:id')
  async getOneByUserId(@Param('id', ParseIntPipe) id: number): Promise<Order[]> {
    return this.ordersService.getOrderByUserId(id);
  }

  // Update order by id — MIJOZ (egasi), SUPERADMIN yoki DO'KON ADMINI
  // (topshiriq №14, 2-band). Ilgari faqat mijoz JWT'si o'tardi, ya'ni
  // buyurtma holatini faqat xaridorning o'zi o'zgartira olardi — bu
  // mantiqan teskari edi.
  //
  // Do'kon admini aralash buyurtmaga tega olmaydi: batafsil qoida
  // `orders.service.ts` -> `ensureCanWrite`.
  @ApiOperation({
    summary: "Update order by id (egasi, superadmin yoki do'kon admini)",
  })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(CustomerOrBackofficeGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderDto: UpdateOrderDto,
    @Req() req: any,
  ) {
    return this.ordersService.updateOrderById(id, updateOrderDto, req.actor);
  }

  // Delete order by id — update bilan bir xil qoida.
  @ApiOperation({
    summary: "Delete order by id (egasi, superadmin yoki do'kon admini)",
  })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(CustomerOrBackofficeGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.ordersService.deleteOrderById(id, req.actor);
  }

  // Adminka: buyurtma + yetkazishlari (topshiriq №22, 4-band). Mijoz uchun `one/:id`.
  // DIQQAT: bu marshrut ENG OXIRIDA turadi — aks holda `all` ham `:id` deb o'qilardi.
  @ApiOperation({ summary: "Buyurtma va yetkazishlari (servis kaliti, admin yoki do'kon tokeni)" })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(AdminOrStoreGuard)
  @Get(':id')
  async getForBackoffice(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.ordersService.getOrderForBackoffice(id, scopedStoreId(req));
  }
}
