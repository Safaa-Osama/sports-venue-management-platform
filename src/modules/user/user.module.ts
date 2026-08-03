import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserRepo } from 'src/common/reposetories/user-repo';
import userModel from './entities/user.entity';
import { TokenService } from 'src/common/services/token/tokenService';
import { JwtService } from '@nestjs/jwt';
import RedisService from 'src/common/services/redis/redis.service';

@Module({
  imports:[userModel],
  controllers: [UserController],
  providers: [UserService, UserRepo,TokenService,JwtService,RedisService],
})
export class UserModule {}
