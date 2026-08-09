import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminUserRepo } from 'src/common/reposetories/admin-user-repo';
import { BookingRepo } from 'src/common/reposetories/booking-repo';
import { CouponRepo } from 'src/common/reposetories/coupon-repo';
import { CustomerUserRepo } from 'src/common/reposetories/customer-user-repo';
import { VenueRepo } from 'src/common/reposetories/venue-repo';
import { WalletRepo } from 'src/common/reposetories/wallet-repo';
import RedisService from 'src/common/services/redis/redis.service';
import { TokenService } from 'src/common/services/token/tokenService';
import couponModel from '../coupon/entities/coupon.entity';
import adminUserModel from '../user/entities/admin-user.entity';
import customerUserModel from '../user/entities/customer-user.entity';
import venueModel from '../venue/entities/venue.entity';
import { WalletModule } from '../wallet/wallet.module';
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
    WalletModule,
  ],
  controllers: [BookingController],
  providers: [
    BookingService,
    BookingGateway,
    BookingRepo,
    VenueRepo,
    CouponRepo,
    TokenService,
    JwtService,
    CustomerUserRepo,
    AdminUserRepo,
    RedisService,
  ],
  exports: [],
})
export class BookingModule { }

