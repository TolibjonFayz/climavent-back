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
import { OrderItemsService } from './order_items.service';
import { CreateOrderItemDto } from './dto/create-order_item.dto';
import { UpdateOrderItemDto } from './dto/update-order_item.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderItem } from './model/order_item.model';
import { UserGuard } from 'src/guards/user.guard';

@ApiTags('Order items')
@ApiBearerAuth()
@Controller('order-items')
export class OrderItemsController {
  constructor(private readonly orderItemsService: OrderItemsService) {}

  //Create order item — faqat buyurtma egasi yoki admin
  @ApiOperation({ summary: 'Creating order item (owner or admin)' })
  @UseGuards(UserGuard)
  @Post('create')
  async create(
    @Body() createOrderItemDto: CreateOrderItemDto,
    @Req() req: any,
  ) {
    return this.orderItemsService.createOrderItem(
      createOrderItemDto,
      req.user,
    );
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

  //Update order item by id — faqat buyurtma egasi yoki admin
  @ApiOperation({ summary: 'Update order item by id (owner or admin)' })
  @UseGuards(UserGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id') id: number,
    @Body() updateOrderItemDto: UpdateOrderItemDto,
    @Req() req: any,
  ) {
    return this.orderItemsService.updateOrderItemById(
      id,
      updateOrderItemDto,
      req.user,
    );
  }

  //Delete order item by id — faqat buyurtma egasi yoki admin
  @ApiOperation({ summary: 'Delete order item by id (owner or admin)' })
  @UseGuards(UserGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id') id: number, @Req() req: any) {
    return this.orderItemsService.deleteOrderItemById(id, req.user);
  }
}
