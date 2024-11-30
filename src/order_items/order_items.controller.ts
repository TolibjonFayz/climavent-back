import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { OrderItemsService } from './order_items.service';
import { CreateOrderItemDto } from './dto/create-order_item.dto';
import { UpdateOrderItemDto } from './dto/update-order_item.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderItem } from './model/order_item.model';

@ApiTags('Order items')
@Controller('order-items')
export class OrderItemsController {
  constructor(private readonly orderItemsService: OrderItemsService) {}

  //Create order
  @ApiOperation({ summary: 'Creating order item' })
  @Post('create')
  async create(@Body() createOrderItemDto: CreateOrderItemDto) {
    return this.orderItemsService.createOrderItem(createOrderItemDto);
  }

  //Get all orders
  @ApiOperation({ summary: 'Get all order items' })
  @Get('all')
  async getAll(): Promise<OrderItem[]> {
    return this.orderItemsService.getAllOrderItems();
  }

  //Get order by id
  @ApiOperation({ summary: 'Get order item by id' })
  @Get('one/:id')
  async getOne(@Param('id') id: number): Promise<OrderItem> {
    return this.orderItemsService.getOrderItemById(id);
  }

  //Get order by user id
  @ApiOperation({ summary: 'Get order item by user id' })
  @Get('oneuser/:id')
  async getOneByUserId(@Param('id') id: number): Promise<OrderItem> {
    return this.orderItemsService.getOrderItemByOrderId(id);
  }

  //Update order by id
  @ApiOperation({ summary: 'Update order item by id' })
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateOrderItemDto: UpdateOrderItemDto,
  ) {
    return this.orderItemsService.updateOrderItemById(id, updateOrderItemDto);
  }

  //Delete order by id
  @ApiOperation({ summary: 'Delete order item by id' })
  @Delete('delete/:id')
  async deleteOne(@Param('id') id: number) {
    return this.orderItemsService.deleteOrderItemById(id);
  }
}
