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
import { OrderItemsService } from './order_items.service';
import { CreateOrderItemDto } from './dto/create-order_item.dto';
import { UpdateOrderItemDto } from './dto/update-order_item.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { OrderItem } from './model/order_item.model';
import { UserGuard } from 'src/guards/user.guard';
import { AdminOrStoreGuard } from 'src/guards/admin_or_store.guard';
import { CustomerOrBackofficeGuard } from 'src/guards/customer_or_backoffice.guard';
import { scopedStoreId } from 'src/common/helpers/store-scope';

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

  // Get all order items — servis kaliti, sayt admini yoki DO'KON TOKENI.
  // Do'kon admini faqat o'z do'koni mahsulotlariga tegishli qatorlarni
  // oladi (topshiriq №13, 6-band) — izolyatsiya endi serverda.
  @ApiOperation({
    summary: "Get all order items (servis kaliti, admin yoki do'kon tokeni)",
  })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(AdminOrStoreGuard)
  @Get('all')
  async getAll(@Req() req: any): Promise<OrderItem[]> {
    return this.orderItemsService.getAllOrderItems(scopedStoreId(req));
  }

  // Get order item by id.
  // Ilgari guard UMUMAN yo'q edi — tokensiz so'rov mijozning yetkazib
  // berish manzilini qaytarardi. Endi: buyurtma egasi, orqa ofis yoki
  // (o'z mahsuloti bo'lsa) do'kon admini.
  @ApiOperation({ summary: 'Get order item by id (egasi yoki orqa ofis)' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(CustomerOrBackofficeGuard)
  @Get('one/:id')
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ): Promise<OrderItem> {
    return this.orderItemsService.getOrderItemById(id, req.actor);
  }

  // Get order item by ORDER id (nomi tarixiy — `oneuser` emas, buyurtma
  // id'si kutiladi). Himoya `one/:id` bilan bir xil.
  @ApiOperation({ summary: 'Get order item by order id (egasi yoki orqa ofis)' })
  @ApiBearerAuth()
  @ApiSecurity('service-key')
  @UseGuards(CustomerOrBackofficeGuard)
  @Get('oneuser/:id')
  async getOneByUserId(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ): Promise<OrderItem> {
    return this.orderItemsService.getOrderItemByOrderId(id, req.actor);
  }

  //Update order item by id — faqat buyurtma egasi yoki admin
  @ApiOperation({ summary: 'Update order item by id (owner or admin)' })
  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Patch('update/:id')
  async updateOne(
    @Param('id', ParseIntPipe) id: number,
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
  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Delete('delete/:id')
  async deleteOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.orderItemsService.deleteOrderItemById(id, req.user);
  }
}
