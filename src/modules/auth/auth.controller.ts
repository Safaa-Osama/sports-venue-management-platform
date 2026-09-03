import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  CreateAdminDto,
  CustomerSendOtpDto,
  CustomerVerifyOtpDto,
  DashboardLoginDto,
  GoogleLoginDto,
  LogoutDto,
  RefreshTokenDto,
} from './dto/auth.dto';

import { FileInterceptor } from '@nestjs/platform-express';
import { multer_cloud } from 'src/common/interceptor/multer';
import { MulterEnum, StoreEnum } from 'src/common/enums/multerEnum';
import { auth } from 'src/common/decorator/auth.decorator';
import { User } from 'src/common/decorator/user.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';


@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }


  @Post('customer/send-otp')
  @ApiOperation({
    summary: 'Send OTP to Customer Mobile Phone',
    description:
      'Generates a one-time password (OTP) and sends it via SMS to the specified customer mobile number. Valid for 5 minutes.',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      example: {
        success: true,
        statusCode: 200,
        message: 'done',
        data: { message: 'OTP sent successfully' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid phone number format' })
  sendCustomerOtp(@Body() body: CustomerSendOtpDto) {
    return this.authService.sendCustomerOtp(body);
  }

  @Post('customer/verify-otp')
  @ApiOperation({
    summary: 'Verify Customer OTP & Complete Profile (with optional Avatar Upload)',
    description:
      'Verifies the 6-digit OTP code. If the user is new, creates the user and automatically provisions a wallet. Supports multipart/form-data for uploading an optional avatar image.',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    description: 'OTP verification payload + optional avatar file upload',
    schema: {
      type: 'object',
      required: ['code'],
      properties: {
        code: { type: 'string', example: '123456', description: '6-digit SMS OTP' },
        phone: { type: 'string', example: '+201012345678', description: 'Customer phone number' },
        userName: { type: 'string', example: 'John Doe', description: 'Display name' },
        position: { type: 'string', example: 'Striker', description: 'Field position' },
        avatar: {
          type: 'string',
          format: 'binary',
          description: 'Avatar image file (JPG/PNG, max 5MB)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully; returns customer user object and JWT access token',
    schema: {
      example: {
        success: true,
        statusCode: 200,
        message: 'done',
        data: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            _id: '64e8b0a1f2b4c10012345678',
            phone: '+201012345678',
            userName: 'John Doe',
            role: 'customer',
            avatar: 'https://s3.amazonaws.com/.../avatar.jpg',
            walletBalance: 0,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP code' })
  @UseInterceptors(
    FileInterceptor(
      'avatar',
      multer_cloud({
        storeType: StoreEnum.memory,
        customType: MulterEnum.image,
        maxFileSize: 5 * 1024 * 1024,
      }),
    ),
  )
  verifyCustomerOtp(
    @Body() body: CustomerVerifyOtpDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    return this.authService.verifyCustomerOtp(body, avatar);
  }

  @Post('signup-google')
  @ApiOperation({
    summary: 'Google OAuth Sign-In / Sign-Up',
    description:
      'Authenticates a customer or user using a verified Google OAuth ID Token. Creates a customer account if one does not exist.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authenticated successfully with Google; returns JWT token and user info',
    schema: {
      example: {
        success: true,
        statusCode: 200,
        message: 'done',
        data: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            _id: '64e8b0a1f2b4c10012345678',
            email: 'user@gmail.com',
            userName: 'John Doe',
            role: 'customer',
            provider: 'google',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid Google ID token' })
  signUpWithGoogle(@Body() body: GoogleLoginDto) {
    return this.authService.signUpWithGoogle(body);
  }

  // --- DASHBOARD ADMIN/EMPLOYEE ENDPOINTS ---

  @Post('dashboard/login')
  @ApiOperation({
    summary: 'Dashboard Staff Login (Admin / SuperAdmin / Owner / Manager)',
    description:
      'Authenticates dashboard management users via email and password. Returns JWT token and admin permissions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged in successfully',
    schema: {
      example: {
        success: true,
        statusCode: 200,
        message: 'done',
        data: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            _id: '64e8b0a1f2b4c10012345679',
            email: 'admin@sportsvenue.com',
            userName: 'Admin User',
            role: 'superAdmin',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  loginDashboard(@Body() body: DashboardLoginDto): Promise<any> {
    return this.authService.loginDashboard(body);
  }

  @Post('dashboard/users')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create Dashboard Admin/Staff Account (SuperAdmin / Admin only)',
    description:
      'Creates a new administrative or venue manager account in the admin dashboard system.',
  })
  @ApiResponse({
    status: 201,
    description: 'Admin user created successfully',
    schema: {
      example: {
        success: true,
        statusCode: 201,
        message: 'done',
        data: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            _id: '64e8b0a1f2b4c10012345679',
            email: 'admin@sportsvenue.com',
            userName: 'Admin User',
            role: 'admin',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @auth({ roles: [RoleEnum.superAdmin, RoleEnum.admin] })
  createAdminUser(@Body() body: CreateAdminDto): Promise<any> {
    return this.authService.createAdminUser(body);
  }

  @Post('refresh-token')
  @ApiOperation({
    summary: 'Refresh Access Token using Refresh Token',
    description:
      'Exchanges a valid Refresh Token for a new pair of Access Token and Refresh Token (Refresh Token Rotation with grace window).',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    schema: {
      example: {
        success: true,
        statusCode: 200,
        message: 'done',
        data: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            _id: '64e8b0a1f2b4c10012345678',
            userName: 'John Doe',
            email: 'user@example.com',
            role: 'customer',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid, expired, or revoked refresh token' })
  refreshToken(@Body() body: RefreshTokenDto) {
    return this.authService.refreshToken(body);
  }

  @Post('logout')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'User / Admin Logout',
    description: 'Revokes the current access token and optional refresh token in Redis cache.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    schema: {
      example: {
        success: true,
        statusCode: 200,
        message: 'done',
        data: { message: 'Logged out successfully' },
      },
    },
  })
  @auth()
  logout(@User() user: any, @Body() body?: LogoutDto) {
    return this.authService.logout(user, body);
  }
}