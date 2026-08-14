import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { CustomerUserRepo } from 'src/common/reposetories/customer-user-repo';
import { AdminUserRepo } from 'src/common/reposetories/admin-user-repo';
import { OtpService } from 'src/common/services/otp/otp.service';
import { S3Service } from 'src/common/services/s3Service/s3.service';
import { TokenService } from 'src/common/services/token/tokenService';
import { CreateAdminDto, CustomerSendOtpDto, CustomerVerifyOtpDto, DashboardLoginDto, GoogleLoginDto } from './dto/auth.dto';
import { ProviderEnum, RoleEnum } from 'src/common/enums/userEnum';
import { randomUUID } from 'crypto';
import { compare, hash } from 'src/common/services/securityService/hash';
import { OAuth2Client } from 'google-auth-library';


@Injectable()
export class AuthService {
  constructor(
    private readonly customerUserRepo: CustomerUserRepo,
    private readonly adminUserRepo: AdminUserRepo,
    private readonly otpService: OtpService,
    private readonly s3Service: S3Service,
    private readonly tokenService: TokenService,
  ) { }

  // --- CUSTOMER MOBILE AUTH ---


  async sendCustomerOtp(body: CustomerSendOtpDto) {
    return this.otpService.sendOtp(body.phone);
  }

  async verifyCustomerOtp(body: CustomerVerifyOtpDto, avatar?: Express.Multer.File) {
    const { phone, code, userName, position } = body;

    await this.otpService.verifyOtp(phone, code);

    let customer = await this.customerUserRepo.findOne({ filter: { phone } });

    if (!customer) {
      let uploadedImage: string | undefined;

      if (avatar) {
        uploadedImage = await this.s3Service.uploadFile({
          file: avatar,
          path: 'customers',
        });
      }


      customer = await this.customerUserRepo.create({
        userName,
        phone,
        position,
        avatar: uploadedImage,
        provider: ProviderEnum.system,
        walletBalance: 0,
      });

      if (!customer) {
        await this.s3Service.deleteFile(uploadedImage!)
        throw new BadRequestException('Failed to create customer account');
      }
    }

    // Generate Tokens
    const uuid = randomUUID();
    const accessSecret = this.tokenService.getAccessSecret();
    const refreshSecret = this.tokenService.getRefreshSecret();

    const accessToken = await this.tokenService.generateToken({
      payload: {
        id: customer._id,
        phone: customer.phone,
        userType: 'customer',
        role: RoleEnum.customer,
      },
      options: {
        secret: accessSecret,
        expiresIn: 60 * 60,
        jwtid: uuid,
      },
    });

    const refreshToken = await this.tokenService.generateToken({
      payload: {
        id: customer._id,
        phone: customer.phone,
        userType: 'customer',
        role: RoleEnum.customer,
      },
      options: {
        secret: refreshSecret,
        expiresIn: '30d',
        jwtid: uuid,
      },
    });

    return { customer, accessToken, refreshToken };
  }

  // --- DASHBOARD ADMIN / EMPLOYEE AUTH ---

  async loginDashboard(body: DashboardLoginDto) {
    const { email, password } = body;
    const normalizedEmail = email.toLowerCase().trim();

    const admin = await this.adminUserRepo.findOne({
      filter: { email: normalizedEmail },
      options: { select: '+password' },
    });

    if (!admin || !admin.password) {
      throw new BadRequestException('Invalid credentials');
    }

    const isMatch = compare({ text: password, cipherTxt: admin.password });
    if (!isMatch) {
      throw new BadRequestException('Invalid credentials');
    }

    const uuid = randomUUID();
    const accessSecret = this.tokenService.getAccessSecret();
    const refreshSecret = this.tokenService.getRefreshSecret();

    const accessToken = await this.tokenService.generateToken({
      payload: {
        id: admin._id,
        email: admin.email,
        userType: 'admin',
        role: admin.role,
      },
      options: {
        secret: accessSecret,
        expiresIn: '1d',
        jwtid: uuid,
      },
    });

    const refreshToken = await this.tokenService.generateToken({
      payload: {
        id: admin._id,
        email: admin.email,
        userType: 'admin',
        role: admin.role,
      },
      options: {
        secret: refreshSecret,
        expiresIn: '7d',
        jwtid: uuid,
      },
    });

  
    return { user: admin, accessToken, refreshToken };
  }

  async createAdminUser(body: CreateAdminDto) {
    const { email, password, userName, role } = body;
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await this.adminUserRepo.findOne({
      filter: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Admin user with this email already exists');
    }

    const admin = await this.adminUserRepo.create({
      userName,
      email: normalizedEmail,
      password: hash({ text: password }),
      role: role || RoleEnum.admin,
    });

    console.log({admin})
    if (!admin) {
      throw new BadRequestException('Failed to create admin user');
    }

    return admin;
  }



  async signUpWithGoogle(body: GoogleLoginDto) {
    const { idToken } = body;

    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.CLIENT_ID;
    if (!clientId) {
      throw new BadRequestException('Google Client ID is not configured on the server');
    }

    const client = new OAuth2Client(clientId);
    let ticket: any;
    try {
      ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
    } catch (error) {
      throw new BadRequestException('Invalid or expired Google ID token');
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new BadRequestException('Invalid Google token payload');
    }

    if (payload.email_verified === false) {
      throw new BadRequestException('Google email is not verified');
    }

    const { email, name, picture } = payload;

    let user = await this.customerUserRepo.findOne({ filter: { email } });

    if (!user) {
      const finalName = name || body.userName || `User-${email.split('@')[0]}`;
      user = await this.customerUserRepo.create({
        userName: finalName,
        email,
        emailConfirmed: payload.email_verified,
        avatar: picture,
        provider: ProviderEnum.google,
        walletBalance: 0,
      });

      if (!user) {
        throw new BadRequestException('Failed to create customer account');
      }
    } else {
      if (user.provider === ProviderEnum.system) {
        throw new BadRequestException('Provider mismatch: account exists with system credentials');
      }
      if (!user.provider) {
        user =
          (await this.customerUserRepo.findOneAndUpdate({
            filter: { _id: user._id },
            update: { provider: ProviderEnum.google, emailConfirmed: payload.email_verified },
          })) || user;
      }
    }

    const uuid = randomUUID();
    const accessSecret = this.tokenService.getAccessSecret();
    const refreshSecret = this.tokenService.getRefreshSecret();

    const accessToken = await this.tokenService.generateToken({
      payload: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        userType: 'customer',
        role: RoleEnum.customer,
      },
      options: {
        secret: accessSecret,
        expiresIn: '1d',
        jwtid: uuid,
      },
    });

    const refreshToken = await this.tokenService.generateToken({
      payload: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        userType: 'customer',
        role: RoleEnum.customer,
      },
      options: {
        secret: refreshSecret,
        expiresIn: '7d',
        jwtid: uuid,
      },
    });

    return { user, accessToken, refreshToken };
  }
}
