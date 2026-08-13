import { Module } from '@nestjs/common';
import { amenitiesRepo } from 'src/common/reposetories/amenities-repo';
import { VenueRepo } from 'src/common/reposetories/venue-repo';
import { CustomerUserRepo } from 'src/common/reposetories/customer-user-repo';
import { AdminUserRepo } from 'src/common/reposetories/admin-user-repo';
import { TokenService } from 'src/common/services/token/tokenService';
import RedisService from 'src/common/services/redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import { AmenitiesController } from './amenities.controller';
import { AmenitiesService } from './amenities.service';
import AmenitiesModel from './entities/amenities.entity';
import venueModel from '../venue/entities/venue.entity';
import customerUserModel from '../user/entities/customer-user.entity';
import adminUserModel from '../user/entities/admin-user.entity';

@Module({
  imports: [
    AmenitiesModel,
    venueModel,
    customerUserModel,
    adminUserModel,
  ],
  controllers: [AmenitiesController],
  providers: [
    AmenitiesService,
    amenitiesRepo,
    VenueRepo,
    CustomerUserRepo,
    AdminUserRepo,
    TokenService,
    JwtService,
    RedisService,
  ],
  exports: [AmenitiesService, amenitiesRepo],
})
export class AmenitiesModule {}
