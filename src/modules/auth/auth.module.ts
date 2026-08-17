import { Module } from '@nestjs/common';
import customerUserModel from '../user/entities/customer-user.entity';
import adminUserModel from '../user/entities/admin-user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CustomerUserRepo } from 'src/common/repositories/customer-user-repo';
import { AdminUserRepo } from 'src/common/repositories/admin-user-repo';
import RedisService from 'src/common/services/redis/redis.service';
import { S3Service } from 'src/common/services/s3Service/s3.service';
import { TokenService } from 'src/common/services/token/tokenService';
import { OtpService } from 'src/common/services/otp/otp.service';

@Module({
  imports: [customerUserModel, adminUserModel],
  controllers: [AuthController],
  providers: [
    AuthService,
    CustomerUserRepo,
    AdminUserRepo,
    OtpService,
    RedisService,
    S3Service,
    TokenService,
  ],
})
export class AuthModule { }
