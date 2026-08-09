import { Body, Controller, Post } from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  createPayment(@Body() body: CreatePaymentDto) {
    return this.paymentService.createPayment(body);
  }
}