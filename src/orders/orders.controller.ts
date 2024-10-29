import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Order } from './model/order.model';

@ApiTags("Orders")
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  //Create order
  @ApiOperation({ summary: 'Creating order' })
  @Post('create')
  async create(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.createOrder(createOrderDto);
  }

  //Get all orders
  @ApiOperation({ summary: 'Get all orders' })
  @Get('all')
  async getAll(): Promise<Order[]> {
    return this.ordersService.getAllOrders();
  }

  //Get order by id
  @ApiOperation({ summary: 'Get order by id' })
  @Get('one/:id')
  async getOne(@Param('id') id: number): Promise<Order> {
    return this.ordersService.getOrderById(id);
  }

  //Get order by user id
  @ApiOperation({ summary: 'Get order by user id' })
  @Get('oneuser/:id')
  async getOneByUserId(@Param('id') id: number): Promise<Order> {
    return this.ordersService.getOrderByUserId(id);
  }

  //Update order by id
  @ApiOperation({ summary: 'Update order by id' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateOrderDto: UpdateOrderDto,
  ) {
    return this.ordersService.updateOrderById(id, updateOrderDto);
  }

  //Delete order by id
  @ApiOperation({ summary: 'Delete order by id' })
  @Delete('delete/:id')
  async deleteOne(@Param('id') id: number) {
    return this.ordersService.deleteOrderById(id);
  }
}
