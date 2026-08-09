import { Injectable } from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentService {
  createPayment(body: CreatePaymentDto) {
   const {bookingId , amount , paymentMethod , transactionId , currency , status , provider , paidAt} = body;

  }

}