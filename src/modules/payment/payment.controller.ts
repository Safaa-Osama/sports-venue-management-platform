import {
  Body, Controller, Get, Headers, Param, Patch, Post, Query,
} from '@nestjs/common';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import type { UserDocument } from '../user/entities/user.entity';
import { CreatePaymentDto, MarkCashPaidDto, QueryPaymentDto, RefundPaymentDto } from './dto/payment.dto';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) { }

  @Post()
  @auth({
    roles: [RoleEnum.customer, RoleEnum.user, RoleEnum.owner, RoleEnum.manager, RoleEnum.admin, RoleEnum.superAdmin],
  })
  createPayment(
    @Body() body: CreatePaymentDto,
    @User() user: UserDocument,
  ) {
    return this.paymentService.createPayment(body, user);
  }

  @Get('my-payments')
  @auth({ roles: [RoleEnum.customer, RoleEnum.user] })
  getMyPayments(
    @User() user: UserDocument,
    @Query() query: QueryPaymentDto,
  ) {
    return this.paymentService.getMyPayments(user, query);
  }

  @Get('venue/:venueId')
  @auth({
    roles: [RoleEnum.owner, RoleEnum.manager, RoleEnum.admin, RoleEnum.superAdmin,],
  })
  getVenuePayments(
    @Param('venueId') venueId: string,
    @Query() query: QueryPaymentDto,
    @User() user: UserDocument,
  ) {
    return this.paymentService.getVenuePayments(venueId, query, user);
  }

  @Get(':id')
  @auth({})
  getPaymentById(
    @Param('id') id: string,
    @User() user: UserDocument,
  ) {
    return this.paymentService.getPaymentById(id, user);
  }

  @Patch(':id/mark-cash-paid')
  @auth({
    roles: [RoleEnum.owner, RoleEnum.manager, RoleEnum.admin, RoleEnum.superAdmin,],
  })
  markCashPaid(
    @Param('id') id: string,
    @Body() body: MarkCashPaidDto,
    @User() user: UserDocument,
  ) {
    return this.paymentService.markCashPaid(id, body, user);
  }

  @Post(':id/refund')
  @auth({
    roles: [RoleEnum.owner, RoleEnum.manager, RoleEnum.admin, RoleEnum.superAdmin,],
  })
  refundPayment(
    @Param('id') id: string,
    @Body() body: RefundPaymentDto,
    @User() user: UserDocument,
  ) {
    return this.paymentService.refundPayment(id, body, user);
  }

  @Post('webhook/paymob')
  handlePaymobWebhook(
    @Body() payload: any,
    @Headers('hmac') hmacHeader?: string,
    @Query('hmac') hmacQuery?: string,
  ) {
    return this.paymentService.handlePaymobWebhook(
      payload,
      hmacHeader || hmacQuery,
    );
  }
}
