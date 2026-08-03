import { Module } from '@nestjs/common';
import userModel from '../user/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserRepo } from 'src/common/reposetories/user-repo';
import RedisService from 'src/common/services/redis/redis.service';
import { S3Service } from 'src/common/services/s3Service/s3.service';
import { TokenService } from 'src/common/services/token/tokenService';

@Module({
  imports: [
    userModel
  ],
  controllers: [AuthController],
  providers: [AuthService,UserRepo,RedisService,S3Service,TokenService],
})
export class AuthModule { }
