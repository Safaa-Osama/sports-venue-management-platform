import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { CustomerUserRepo } from 'src/common/reposetories/customer-user-repo';
import { AdminUserRepo } from 'src/common/reposetories/admin-user-repo';
import customerUserModel from './entities/customer-user.entity';
import adminUserModel from './entities/admin-user.entity';
import { TokenService } from 'src/common/services/token/tokenService';
import { JwtService } from '@nestjs/jwt';
import RedisService from 'src/common/services/redis/redis.service';

@Module({
  imports: [customerUserModel, adminUserModel],
  controllers: [UserController],
  providers: [
    UserService,
    CustomerUserRepo,
    AdminUserRepo,
    TokenService,
    JwtService,
    RedisService,
  ],
  exports: [CustomerUserRepo, AdminUserRepo, customerUserModel, adminUserModel],
})
export class UserModule {}
