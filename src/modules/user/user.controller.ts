import { Body, Controller, Get, Param, Patch, UploadedFile, UseInterceptors, } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags, } from '@nestjs/swagger';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import { UpdateAdminUserDto, UpdateCustomerUserDto, } from './dto/update-user.dto';
import { UserService } from './user.service';


@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Get('customers')
  @ApiOperation({
    summary: 'List All Customers',
    description: 'Retrieves all registered customer users with their profile and wallet balance.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of customers retrieved successfully',
  })
  getAllCustomers(): Promise<any> {
    return this.userService.getAllCustomers();
  }

  @Get('customer/profile')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get Authenticated Customer Profile',
    description:
      'Returns the fresh customer profile document for the currently authenticated customer token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Customer profile retrieved successfully',
    schema: {
      example: {
        success: true,
        statusCode: 200,
        message: 'done',
        data: {
          _id: '64e8b0a1f2b4c10012345678',
          userName: 'John Doe',
          phone: '+201012345678',
          email: 'johndoe@example.com',
          avatar: 'https://s3.amazonaws.com/.../avatar.jpg',
          position: 'Midfielder',
          walletBalance: 250,
          status: 'active',
          provider: 'system',
          emailConfirmed: true,
          createdAt: '2026-08-17T12:00:00.000Z',
          updatedAt: '2026-08-17T12:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @auth({ roles: [RoleEnum.customer, RoleEnum.user] })
  getCustomerProfile(@User() user: any) {
    return this.userService.getCustomerProfile(user);
  }

  @Get('customers/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get Customer User by ID',
    description:
      'Retrieves specific customer user profile details by their MongoDB ObjectId.',
  })
  @ApiParam({
    name: 'id',
    description: 'Customer User MongoDB ID',
    example: '64e8b0a1f2b4c10012345678',
  })
  @ApiResponse({
    status: 200,
    description: 'Customer user profile retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid customer ID format' })
  @ApiResponse({ status: 404, description: 'Customer user not found' })
  @auth({
    roles: [
      RoleEnum.admin,
      RoleEnum.superAdmin,
      RoleEnum.owner,
      RoleEnum.manager,
      RoleEnum.customer,
    ],
  })
  getCustomerById(@Param('id') id: string) {
    return this.userService.getCustomerById(id);
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
        status: {
          type: 'string',
          enum: ['active', 'hold', 'suspended'],
          example: 'active',
        },
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
