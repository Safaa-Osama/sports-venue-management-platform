import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminUserRepo } from 'src/common/repositories/admin-user-repo';
import { BookingRepo } from 'src/common/repositories/booking-repo';
import { CouponRepo } from 'src/common/repositories/coupon-repo';
import { CustomerUserRepo } from 'src/common/repositories/customer-user-repo';
import { PaymentRepo } from 'src/common/repositories/payment-repo';
import { VenueRepo } from 'src/common/repositories/venue-repo';
import { WalletRepo } from 'src/common/repositories/wallet-repo';
import { PaymobService } from 'src/common/integration/paymob/paymob.service';
import RedisService from 'src/common/services/redis/redis.service';
import { TokenService } from 'src/common/services/token/tokenService';
import couponModel from '../coupon/entities/coupon.entity';
import paymentModel from '../payment/entities/payment.entity';
import adminUserModel from '../user/entities/admin-user.entity';
import customerUserModel from '../user/entities/customer-user.entity';
import venueModel from '../venue/entities/venue.entity';
import { WalletModule } from '../wallet/wallet.module';
import { PushNotificationModule } from '../push-notification/push-notification.module';
import { BookingController } from './booking.controller';
import { BookingGateway } from './booking.gateway';
import { BookingService } from './booking.service';
import bookingModel from './entities/booking.entity';

@Module({
  imports: [
    bookingModel,
    customerUserModel,
    adminUserModel,
    venueModel,
    couponModel,
    paymentModel,
    WalletModule,
    PushNotificationModule,
  ],
  controllers: [BookingController],
  providers: [
    BookingService,
    BookingGateway,
    BookingRepo,
    PaymentRepo,
    VenueRepo,
    CouponRepo,
    PaymobService,
    TokenService,
    JwtService,
    CustomerUserRepo,
    AdminUserRepo,
    RedisService,
  ],
  exports: [BookingGateway, BookingService],
})
export class BookingModule { }
