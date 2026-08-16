import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminUserRepo } from 'src/common/reposetories/admin-user-repo';
import { BookingRepo } from 'src/common/reposetories/booking-repo';
import { CustomerUserRepo } from 'src/common/reposetories/customer-user-repo';
import { PaymentRepo } from 'src/common/reposetories/payment-repo';
import { VenueRepo } from 'src/common/reposetories/venue-repo';
import RedisService from 'src/common/services/redis/redis.service';
import { TokenService } from 'src/common/services/token/tokenService';
import bookingModel from '../booking/entities/booking.entity';
import adminUserModel from '../user/entities/admin-user.entity';
import customerUserModel from '../user/entities/customer-user.entity';
import venueModel from '../venue/entities/venue.entity';
import { WalletModule } from '../wallet/wallet.module';
import paymentModel from './entities/payment.entity';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PaymobService } from 'src/common/integration/paymob/paymob.service';

@Module({
  imports: [
    paymentModel,
    bookingModel,
    venueModel,
    customerUserModel,
    adminUserModel,
    WalletModule,
  ],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    PaymobService,
    PaymentRepo,
    BookingRepo,
    VenueRepo,
    TokenService,
    JwtService,
    CustomerUserRepo,
    AdminUserRepo,
    RedisService,
  ],
  exports: [PaymentService, PaymentRepo],
})
export class PaymentModule {}
