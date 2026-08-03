import { Module } from '@nestjs/common';
import userModel from '../user/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    userModel
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule { }
