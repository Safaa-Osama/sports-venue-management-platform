import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { CustomerUserRepo } from 'src/common/repositories/customer-user-repo';
import { AdminUserRepo } from 'src/common/repositories/admin-user-repo';
import customerUserModel from './entities/customer-user.entity';
import adminUserModel from './entities/admin-user.entity';
import { TokenService } from 'src/common/services/token/tokenService';
import { JwtService } from '@nestjs/jwt';
import RedisService from 'src/common/services/redis/redis.service';
import { S3Service } from 'src/common/services/s3Service/s3.service';
import { PushNotificationModule } from '../push-notification/push-notification.module';

@Module({
  imports: [customerUserModel, adminUserModel, PushNotificationModule],
  controllers: [UserController],
  providers: [
    UserService,
    CustomerUserRepo,
    AdminUserRepo,
    TokenService,
    JwtService,
    RedisService,
    S3Service,
  ],
  exports: [CustomerUserRepo, AdminUserRepo, customerUserModel, adminUserModel],
})
export class UserModule { }
