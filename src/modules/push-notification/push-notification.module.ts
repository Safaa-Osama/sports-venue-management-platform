import { Module, Global } from '@nestjs/common';
import customerUserModel from 'src/modules/user/entities/customer-user.entity';
import adminUserModel from 'src/modules/user/entities/admin-user.entity';
import userModel from 'src/modules/user/entities/user.entity';
import { PushNotificationService } from './push-notification.service';

@Global()
@Module({
  imports: [customerUserModel, adminUserModel, userModel],
  providers: [PushNotificationService],
  exports: [PushNotificationService],
})
export class PushNotificationModule {}
