import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateAdminDto, CustomerSendOtpDto, CustomerVerifyOtpDto, DashboardLoginDto } from './dto/auth.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { multer_cloud } from 'src/common/interceptor/multer';
import { MulterEnum, StoreEnum } from 'src/common/enums/multerEnum';
import { auth } from 'src/common/decorator/auth.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // --- CUSTOMER MOBILE ENDPOINTS ---

  @Post('customer/send-otp')
  sendCustomerOtp(@Body() body: CustomerSendOtpDto) {
    return this.authService.sendCustomerOtp(body);
  }

  @Post('customer/verify-otp')
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

  // --- DASHBOARD ADMIN/EMPLOYEE ENDPOINTS ---

  @Post('dashboard/login')
  loginDashboard(@Body() body: DashboardLoginDto) {
    return this.authService.loginDashboard(body);
  }

  @Post('dashboard/users')
  createAdminUser(@Body() body: CreateAdminDto) {
    return this.authService.createAdminUser(body);
  }
}
