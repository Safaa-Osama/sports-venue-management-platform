import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { AuthenticationGuard } from 'src/common/guards/authentication.guard';
import { User } from 'src/common/decorator/user.decorator';
import { auth } from 'src/common/decorator/auth.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import { UpdateAdminUserDto, UpdateCustomerUserDto } from './dto/update-user.dto';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('customers')
  getAllCustomers() {
    return this.userService.getAllCustomers();
  }

  @Get('admins')
  getAllAdmins() {
    return this.userService.getAllAdmins();
  }

  @UseGuards(AuthenticationGuard)
  @Get('profile')
  getProfile(@User() user: any) {
    return this.userService.getProfile(user);
  }

  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin, RoleEnum.owner] })
  @Patch('customers/:id')
  async updateCustomerUser(
    @Param('id') id: string,
    @Body() body: UpdateCustomerUserDto,
  ) {
    const updatedCustomer = await this.userService.updateCustomerUser(id, body);
    return {
      message: 'Customer user updated successfully',
      data: updatedCustomer,
    };
  }

  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin, RoleEnum.owner] })
  @Patch('admins/:id')
  async updateAdminUser(
    @Param('id') id: string,
    @Body() body: UpdateAdminUserDto,
  ) {
    const updatedAdmin = await this.userService.updateAdminUser(id, body);
    return {
      message: 'Admin user updated successfully',
      data: updatedAdmin,
    };
  }
}
