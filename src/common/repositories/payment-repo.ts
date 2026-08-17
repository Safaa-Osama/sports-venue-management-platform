import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import BaseRepo from './base-repo';
import { InjectModel } from '@nestjs/mongoose';
import {
  Payment,
  PaymentDocument,
} from 'src/modules/payment/entities/payment.entity';

@Injectable()
export class PaymentRepo extends BaseRepo<PaymentDocument> {
  constructor(
    @InjectModel(Payment.name)
    protected readonly paymentModel: Model<PaymentDocument>,
  ) {
    super(paymentModel);
  }
}
