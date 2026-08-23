import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminUserRepo } from 'src/common/repositories/admin-user-repo';
import { ContactRepo } from 'src/common/repositories/contact-repo';
import { CustomerUserRepo } from 'src/common/repositories/customer-user-repo';
import { UserRepo } from 'src/common/repositories/user-repo';
import RedisService from 'src/common/services/redis/redis.service';
import { TokenService } from 'src/common/services/token/tokenService';
import adminUserModel from '../user/entities/admin-user.entity';
import customerUserModel from '../user/entities/customer-user.entity';
import userModel from '../user/entities/user.entity';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import contactModel from './entities/contact.entity';

@Module({
  imports: [contactModel, adminUserModel, customerUserModel, userModel],
  controllers: [ContactController],
  providers: [
    ContactService,
    ContactRepo,
    AdminUserRepo,
    CustomerUserRepo,
    UserRepo,
    TokenService,
    JwtService,
    RedisService,
  ],
  exports: [ContactService, ContactRepo],
})
export class ContactModule {}
