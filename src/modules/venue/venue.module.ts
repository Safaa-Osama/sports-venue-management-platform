import { Module } from '@nestjs/common';
import { VenueService } from './venue.service';
import { VenueController } from './venue.controller';
import { VenueRepo } from 'src/common/reposetories/venue-repo';
import venueModel from './entities/venue.entity';
import { S3Service } from 'src/common/services/s3Service/s3.service';
import { TokenService } from 'src/common/services/token/tokenService';
import { JwtService } from '@nestjs/jwt';
import { CustomerUserRepo } from 'src/common/reposetories/customer-user-repo';
import { AdminUserRepo } from 'src/common/reposetories/admin-user-repo';
import RedisService from 'src/common/services/redis/redis.service';
import customerUserModel from '../user/entities/customer-user.entity';
import adminUserModel from '../user/entities/admin-user.entity';

@Module({
  imports: [venueModel, customerUserModel, adminUserModel],
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
export class VenueModule {}