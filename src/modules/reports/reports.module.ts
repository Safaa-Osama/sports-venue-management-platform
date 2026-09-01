import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminUserRepo } from 'src/common/repositories/admin-user-repo';
import { AdvertisementRepo } from 'src/common/repositories/advertisement-repo';
import { BookingRepo } from 'src/common/repositories/booking-repo';
import { ContactRepo } from 'src/common/repositories/contact-repo';
import { CouponRepo } from 'src/common/repositories/coupon-repo';
import { CustomerUserRepo } from 'src/common/repositories/customer-user-repo';
import { PaymentRepo } from 'src/common/repositories/payment-repo';
import { VenueRepo } from 'src/common/repositories/venue-repo';
import { WalletRepo } from 'src/common/repositories/wallet-repo';
import { WalletTransactionRepo } from 'src/common/repositories/wallet-transaction-repo';
import RedisService from 'src/common/services/redis/redis.service';
import { TokenService } from 'src/common/services/token/tokenService';
import advertisementModel from '../advertisement/entities/advertisement.entity';
import bookingModel from '../booking/entities/booking.entity';
import ContactModel from '../contact/entities/contact.entity';
import couponModel from '../coupon/entities/coupon.entity';
import paymentModel from '../payment/entities/payment.entity';
import adminUserModel from '../user/entities/admin-user.entity';
import customerUserModel from '../user/entities/customer-user.entity';
import venueModel from '../venue/entities/venue.entity';
import walletTransactionModel from '../wallet/entities/wallet-transaction.entity';
import walletModel from '../wallet/entities/wallet.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    bookingModel,
    paymentModel,
    walletModel,
    walletTransactionModel,
    couponModel,
    advertisementModel,
    venueModel,
    customerUserModel,
    adminUserModel,
    ContactModel,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    BookingRepo,
    PaymentRepo,
    WalletRepo,
    WalletTransactionRepo,
    CouponRepo,
    AdvertisementRepo,
    VenueRepo,
    CustomerUserRepo,
    AdminUserRepo,
    ContactRepo,
    TokenService,
    JwtService,
    RedisService,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
