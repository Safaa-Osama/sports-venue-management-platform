import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminUserRepo } from 'src/common/reposetories/admin-user-repo';
import { BookingRepo } from 'src/common/reposetories/booking-repo';
import { CustomerUserRepo } from 'src/common/reposetories/customer-user-repo';
import { VenueRepo } from 'src/common/reposetories/venue-repo';
import RedisService from 'src/common/services/redis/redis.service';
import { TokenService } from 'src/common/services/token/tokenService';
import adminUserModel from '../user/entities/admin-user.entity';
import customerUserModel from '../user/entities/customer-user.entity';
import { VenueModule } from '../venue/venue.module';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import bookingModel from './entities/booking.entity';
import venueModel from '../venue/entities/venue.entity';

@Module({
  imports: [
    bookingModel,
    customerUserModel,
    adminUserModel,
    venueModel,
  ],
  controllers: [BookingController],
  providers: [
    BookingService,
    BookingRepo,
    VenueRepo,
    TokenService,
    JwtService,
    CustomerUserRepo,
    AdminUserRepo,
    RedisService,
  ],
  exports: [],
})
export class BookingModule {}
