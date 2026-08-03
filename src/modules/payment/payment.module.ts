import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PaymentRepo } from 'src/common/reposetories/payment-repo';
import paymentModel from './entities/payment.entity';

@Module({
  imports:[paymentModel],
  controllers: [PaymentController],
  providers: [PaymentService,PaymentRepo],
})
export class PaymentModule {}
