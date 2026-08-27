import { Module } from '@nestjs/common';
import { VenueService } from './venue.service';
import { VenueController } from './venue.controller';
import { VenueRepo } from 'src/common/repositories/venue-repo';
import venueModel from './entities/venue.entity';
import { S3Service } from 'src/common/services/s3Service/s3.service';
import { TokenService } from 'src/common/services/token/tokenService';
import { JwtService } from '@nestjs/jwt';
import { CustomerUserRepo } from 'src/common/repositories/customer-user-repo';
import { AdminUserRepo } from 'src/common/repositories/admin-user-repo';
import RedisService from 'src/common/services/redis/redis.service';
import customerUserModel from '../user/entities/customer-user.entity';
import adminUserModel from '../user/entities/admin-user.entity';
import { PushNotificationModule } from '../push-notification/push-notification.module';

@Module({
  imports: [venueModel, customerUserModel, adminUserModel, PushNotificationModule],
  controllers: [VenueController],
  providers: [
    VenueService,
    VenueRepo,
    S3Service,
    TokenService,
    JwtService,
    CustomerUserRepo,
    AdminUserRepo,
    RedisService,
  ],
  exports: [],
})
export class VenueModule { }
