import { Module, Global } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminUserRepo } from 'src/common/repositories/admin-user-repo';
import { CustomerUserRepo } from 'src/common/repositories/customer-user-repo';
import { UserRepo } from 'src/common/repositories/user-repo';
import RedisService from 'src/common/services/redis/redis.service';
import { RedisModule } from 'src/common/services/redis/redisModule';
import { TokenService } from 'src/common/services/token/tokenService';
import customerUserModel from 'src/modules/user/entities/customer-user.entity';
import adminUserModel from 'src/modules/user/entities/admin-user.entity';
import userModel from 'src/modules/user/entities/user.entity';
import guestDeviceModel from './entities/guest-device.entity';
import notificationModel from './entities/notification.entity';
import { PushNotificationService } from './push-notification.service';
import { NotificationGateway } from './notification.gateway';
import { NotificationController } from './notification.controller';

@Global()
@Module({
  imports: [
    customerUserModel,
    adminUserModel,
    userModel,
    guestDeviceModel,
    notificationModel,
    RedisModule,
  ],
  controllers: [NotificationController],
  providers: [
    PushNotificationService,
    NotificationGateway,
    TokenService,
    JwtService,
    AdminUserRepo,
    CustomerUserRepo,
    UserRepo,
    RedisService,
  ],
  exports: [PushNotificationService, NotificationGateway],
})
export class PushNotificationModule {}
