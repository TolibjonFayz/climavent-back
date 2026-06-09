import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Order } from './model/order.model';
import { AdminGuard } from 'src/guards/admin.guard';
import { UserGuard } from 'src/guards/user.guard';
import { UserSelfGuard } from 'src/guards/user_self.guard';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  //Create order — foydalanuvchi login qilgan bo'lishi kerak
  @ApiOperation({ summary: 'Creating order' })
  @UseGuards(UserGuard)
  @Post('create')
  async create(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.createOrder(createOrderDto);
  }

  //Get all orders — faqat admin (barcha mijozlarning ma'lumotini qaytaradi)
  @ApiOperation({ summary: 'Get all orders (admin)' })
  @UseGuards(AdminGuard)
  @Get('all')
  async getAll(): Promise<Order[]> {
    return this.ordersService.getAllOrders();
  }

  //Get order by id
  @ApiOperation({ summary: 'Get order by id' })
  @UseGuards(UserGuard)
  @Get('one/:id')
  async getOne(@Param('id') id: number): Promise<Order> {
    return this.ordersService.getOrderById(id);
  }

  //Get order by user id — foydalanuvchi faqat o'zinikini ko'radi
  @ApiOperation({ summary: 'Get order by user id' })
  @UseGuards(UserSelfGuard)
  @Get('oneuser/:id')
  async getOneByUserId(@Param('id') id: number): Promise<Order[]> {
    return this.ordersService.getOrderByUserId(id);
  }

  //Update order by id — faqat egasi yoki admin
  @ApiOperation({ summary: 'Update order by id (owner or admin)' })
  @UseGuards(UserGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateOrderDto: UpdateOrderDto,
    @Req() req: any,
  ) {
    return this.ordersService.updateOrderById(id, updateOrderDto, req.user);
  }

  //Delete order by id — faqat egasi yoki admin
  @ApiOperation({ summary: 'Delete order by id (owner or admin)' })
  @UseGuards(UserGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id') id: number, @Req() req: any) {
    return this.ordersService.deleteOrderById(id, req.user);
  }
}
