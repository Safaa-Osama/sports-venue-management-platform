import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminUserRepo } from 'src/common/repositories/admin-user-repo';
import { CouponRepo } from 'src/common/repositories/coupon-repo';
import RedisService from 'src/common/services/redis/redis.service';
import { TokenService } from 'src/common/services/token/tokenService';
import userModel from '../user/entities/user.entity';
import { CouponController } from './coupon.controller';
import { CouponService } from './coupon.service';
import couponModel from './entities/coupon.entity';
import { UserRepo } from 'src/common/repositories/user-repo';
import adminUserModel from '../user/entities/admin-user.entity';
import customerUserModel from '../user/entities/customer-user.entity';
import { CustomerUserRepo } from 'src/common/repositories/customer-user-repo';

@Module({
  imports: [couponModel, userModel, adminUserModel, customerUserModel],
  controllers: [CouponController],
  providers: [
    CouponService,
    UserRepo,
    CustomerUserRepo,
    CouponRepo,
    AdminUserRepo,
    TokenService,
    JwtService,
    RedisService,
  ],
  exports: [],
})
export class CouponModule { }
