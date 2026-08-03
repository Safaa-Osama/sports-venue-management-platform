import { Controller, Get } from '@nestjs/common';
import { UserService } from './user.service';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import type { UserDocument } from './entities/user.entity';


@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Get()
  getAllUser() {
    return this.userService.getAllUser();
  }

  @auth({})
  @Get('profile')
  getProfile(@User() user:UserDocument) {
    return this.userService.getProfile(user);
  }
  
}
