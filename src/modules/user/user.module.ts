import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { CustomerUserRepo } from 'src/common/repositories/customer-user-repo';
import { AdminUserRepo } from 'src/common/repositories/admin-user-repo';
import customerUserModel from './entities/customer-user.entity';
import adminUserModel from './entities/admin-user.entity';
import walletModel from '../wallet/entities/wallet.entity';
import { WalletRepo } from 'src/common/repositories/wallet-repo';
import { TokenService } from 'src/common/services/token/tokenService';
import { JwtService } from '@nestjs/jwt';
import RedisService from 'src/common/services/redis/redis.service';
import { S3Service } from 'src/common/services/s3Service/s3.service';
import { PushNotificationModule } from '../push-notification/push-notification.module';
import { BookingModule } from '../booking/booking.module';

@Module({
  imports: [
    customerUserModel,
    adminUserModel,
    walletModel,
    PushNotificationModule,
    BookingModule,
  ],
  controllers: [UserController],
  providers: [
    UserService,
    CustomerUserRepo,
    AdminUserRepo,
    WalletRepo,
    TokenService,
    JwtService,
    RedisService,
    S3Service,
  ],
  exports: [CustomerUserRepo, AdminUserRepo, customerUserModel, adminUserModel],
})
export class UserModule { }
