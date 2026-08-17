import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminUserRepo } from 'src/common/repositories/admin-user-repo';
import { AdvertisementRepo } from 'src/common/repositories/advertisement-repo';
import { CustomerUserRepo } from 'src/common/repositories/customer-user-repo';
import { UserRepo } from 'src/common/repositories/user-repo';
import RedisService from 'src/common/services/redis/redis.service';
import { RedisModule } from 'src/common/services/redis/redisModule';
import { S3Service } from 'src/common/services/s3Service/s3.service';
import { TokenService } from 'src/common/services/token/tokenService';
import adminUserModel from '../user/entities/admin-user.entity';
import customerUserModel from '../user/entities/customer-user.entity';
import userModel from '../user/entities/user.entity';
import { AdvertisementController } from './advertisement.controller';
import { AdvertisementService } from './advertisement.service';
import advertisementModel from './entities/advertisement.entity';

@Module({
  imports: [advertisementModel,RedisModule,adminUserModel,customerUserModel,userModel,],
  controllers: [AdvertisementController],
  providers: [AdvertisementService,AdvertisementRepo,AdminUserRepo,CustomerUserRepo,UserRepo,TokenService,JwtService,RedisService,S3Service,],
  exports: [],
})
export class AdvertisementModule {}

