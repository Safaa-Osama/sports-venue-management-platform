import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from './user.service';
import { User } from 'src/common/decorator/user.decorator';
import { auth } from 'src/common/decorator/auth.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import {
  UpdateAdminUserDto,
  UpdateCustomerUserDto,
} from './dto/update-user.dto';
import { UserDocument } from './entities/user.entity';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('customers')
  @ApiOperation({
    summary: 'List All Customers',
    description: 'Retrieves all registered customer users with their profile and wallet balance.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of customers retrieved successfully',
  })
  getAllCustomers() {
    return this.userService.getAllCustomers();
  }

  @Get('admins')
  @ApiOperation({
    summary: 'List All Admins / Managers',
    description: 'Retrieves all management and administrative staff members.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of admin users retrieved successfully',
  })
  getAllAdmins() {
    return this.userService.getAllAdmins();
  }

  @Get('profile')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get Current Authenticated User Profile',
    description:
      'Returns the current user profile based on the JWT Bearer token supplied in the Authorization header.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    schema: {
      example: {
        success: true,
        statusCode: 200,
        message: 'done',
        data: {
          _id: '64e8b0a1f2b4c10012345678',
          phone: '+201012345678',
          userName: 'John Doe',
          role: 'customer',
          avatar: 'https://s3.amazonaws.com/.../avatar.jpg',
          walletBalance: 250,
          position: 'Midfielder',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @auth({
    roles: [
      RoleEnum.user,
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.customer,
    ],
  })
  getProfile(@User() user: any) {
    return this.userService.getProfile(user);
  }

  @Patch('customers/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update Customer User (Admin / Owner)',
    description:
      'Updates customer account details (username, phone, position, wallet balance) and optionally uploads a new avatar image.',
  })
  @ApiParam({ name: 'id', description: 'Customer User MongoDB ID', example: '64e8b0a1f2b4c10012345678' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    description: 'Fields to update + optional avatar file upload',
    schema: {
      type: 'object',
      properties: {
        userName: { type: 'string', example: 'John Smith' },
        phone: { type: 'string', example: '+201012345678' },
        position: { type: 'string', example: 'Striker' },
        walletBalance: { type: 'number', example: 500 },
        avatar: {
          type: 'string',
          format: 'binary',
          description: 'Avatar image file (JPG/PNG, max 5MB)',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Customer user updated successfully' })
  @ApiResponse({ status: 404, description: 'Customer user not found' })
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin, RoleEnum.owner] })
  @UseInterceptors(FileInterceptor('avatar'))
  async updateCustomerUser(
    @Param('id') id: string,
    @Body() body: UpdateCustomerUserDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    const updatedCustomer = await this.userService.updateCustomerUser(
      id,
      body,
      avatar,
    );
    return {
      message: 'Customer user updated successfully',
      data: updatedCustomer,
    };
  }

  @Patch('admins/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update Admin/Manager Account (SuperAdmin / Admin)',
    description: 'Updates administrator or staff user credentials/info.',
  })
  @ApiParam({ name: 'id', description: 'Admin User MongoDB ID', example: '64e8b0a1f2b4c10012345679' })
  @ApiResponse({ status: 200, description: 'Admin user updated successfully' })
  @ApiResponse({ status: 404, description: 'Admin user not found' })
  @auth({ roles: [RoleEnum.admin, RoleEnum.superAdmin, RoleEnum.owner] })
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
