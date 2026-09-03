import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { CustomerStatusEnum, ProviderEnum, RoleEnum, } from 'src/common/enums/userEnum';
import { AdminUserRepo } from 'src/common/repositories/admin-user-repo';
import { CustomerUserRepo } from 'src/common/repositories/customer-user-repo';
import { eventEmitter } from 'src/common/services/mailService/email.event';
import { emailTemplete } from 'src/common/services/mailService/mailTemplete';
import { generateOtp, sendMail } from 'src/common/services/mailService/sendMail';
import { OtpService } from 'src/common/services/otp/otp.service';
import RedisService from 'src/common/services/redis/redis.service';
import { S3Service } from 'src/common/services/s3Service/s3.service';
import { compare, hash } from 'src/common/services/securityService/hash';
import { TokenService } from 'src/common/services/token/tokenService';
import { AdminUserDocument } from '../user/entities/admin-user.entity';
import {
  CreateAdminDto,
  CustomerSendOtpDto,
  CustomerVerifyOtpDto,
  DashboardLoginDto,
  GoogleLoginDto,
  LogoutDto,
  RefreshTokenDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly customerUserRepo: CustomerUserRepo,
    private readonly adminUserRepo: AdminUserRepo,
    private readonly otpService: OtpService,
    private readonly s3Service: S3Service,
    private readonly tokenService: TokenService,
    private readonly redisService: RedisService,
  ) { }


  private sanitizeUser(user: AdminUserDocument) {
    if (!user) return null;
    const userObj = user.toObject
      ? user.toObject({ transform: true })
      : { ...user };
    const { password, ...withoutPassword } = userObj;
    return withoutPassword;
  }

  async sendCustomerOtp(body: CustomerSendOtpDto) {
    return this.otpService.sendOtp(body.phone);
  }

  async sendEmailOTP({ email }: { email: string }) {
    const isBlocked = await this.redisService.ttl(
      this.redisService.blockOtp(email),
    );
    if (isBlocked && isBlocked > 0) {
      throw new BadRequestException(
        `You are blocked, Try again after ${isBlocked} seconds`,
      );
    }

    const ttl = await this.redisService.ttl(this.redisService.otpKey(email));
    if (ttl && ttl > 0) {
      throw new BadRequestException(`can not sent OTP after ${ttl} seconds`);
    }

    const maximumOtp = await this.redisService.getValue(
      this.redisService.maxOtp(email),
    );
    if (maximumOtp > 3) {
      await this.redisService.setValue({
        key: this.redisService.blockOtp(email),
        value: '1',
        ttl: 60 * 3,
      });
      throw new BadRequestException('you have exceeded the maximum number of tries ');
    }

    const otp = generateOtp();
    eventEmitter.emit(email, async () => {
      await sendMail({
        to: email,
        subject: 'sport venue platform',
        html: emailTemplete({ otp }),
      });
    });

    await this.redisService.setValue({
      key: this.redisService.otpKey(email),
      value: `${otp}`,
      ttl: 60 * 3,
    });

    await this.redisService.inc(this.redisService.maxOtp(email));
  };

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
      });

      if (!customer) {
        await this.s3Service.deleteFile(uploadedImage!);
        throw new BadRequestException('Failed to create customer account');
      }
    }

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
  async loginDashboard(body: DashboardLoginDto): Promise<any> {
    const { email, password } = body;
    const normalizedEmail = email.toLowerCase().trim();

    const admin = await this.adminUserRepo.findOne({
      filter: { email: normalizedEmail },
      options: { select: '+password' }
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
        expiresIn: '1h',
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

    return { admin: this.sanitizeUser(admin), accessToken, refreshToken };
  }


  async createAdminUser(body: CreateAdminDto): Promise<any> {
    const { email, password, userName, role } = body;
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await this.adminUserRepo.findOne({
      filter: { email: normalizedEmail },
      options: { select: '+password' }
    });
    if (existing) {
      throw new ConflictException('This admin is already exists');
    }

    const admin = await this.adminUserRepo.create({
      userName,
      email: normalizedEmail,
      password: hash({ text: password }),
      role: role || RoleEnum.admin,
    });

    if (!admin) {
      throw new BadRequestException('Failed to create admin ');
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
        expiresIn: '1h',
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

    return { admin: this.sanitizeUser(admin), accessToken, refreshToken };
  }

  
  async signUpWithGoogle(body: GoogleLoginDto) {
    const { idToken } = body;

    const clientId = process.env.CLIENT_ID;
    if (!clientId) {
      throw new BadRequestException('Google Client ID is not configured on the server');
    }

    const client = new OAuth2Client();
    let ticket: any;
    try {
      const audience = clientId.includes(',') ? clientId.split(',').map(id => id.trim()) : clientId;
      ticket = await client.verifyIdToken({
        idToken,
        audience,
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
      });

      if (!user) {
        throw new BadRequestException('Failed to create customer account');
      }
    } else {
      if (user.provider === ProviderEnum.system) {
        throw new BadRequestException('This provider mismatch: account exists with system credentials');
      }
      if (!user.provider) {
        user = (await this.customerUserRepo.findOneAndUpdate({
          filter: { _id: user._id },
          update: {
            provider: ProviderEnum.google,
            emailConfirmed: payload.email_verified,
          },
        }))
      }
    }

    const uuid = randomUUID();
    const accessSecret = this.tokenService.getAccessSecret();
    const refreshSecret = this.tokenService.getRefreshSecret();

    const accessToken = await this.tokenService.generateToken({
      payload: {
        id: user!._id,
        email: user!.email,
        phone: user!.phone,
        userType: 'customer',
        role: RoleEnum.customer,
      },
      options: {
        secret: accessSecret,
        expiresIn: '1h',
        jwtid: uuid,
      },
    });

    const refreshToken = await this.tokenService.generateToken({
      payload: {
        id: user!._id,
        email: user!.email,
        phone: user!.phone,
        userType: 'customer',
        role: RoleEnum.customer,
      },
      options: {
        secret: refreshSecret,
        expiresIn: '30d',
        jwtid: uuid,
      },
    });

    return { user, accessToken, refreshToken };
  }

  async refreshToken(body: RefreshTokenDto): Promise<any> {
    const { refreshToken } = body;
    if (!refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    let decoded: any;
    try {
      decoded = await this.tokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!decoded?.jti || !decoded?.id) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // 1. Check if we already processed this refresh token recently (grace window cache)
    const graceKey = `refresh-grace::${decoded.jti}`;
    const cachedResponse = await this.redisService.getValue(graceKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    // 2. Check if token was explicitly revoked
    const revokedKey = this.redisService.revokedKey({
      userId: decoded.id,
      jti: decoded.jti,
    });
    const isRevoked = await this.redisService.getValue(revokedKey);
    if (isRevoked) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // 3. Fetch user and verify active status
    let user: any = null;
    if (decoded.userType === 'customer') {
      user = await this.customerUserRepo.findOne({ filter: { _id: decoded.id } });
    } else if (decoded.userType === 'admin') {
      user = await this.adminUserRepo.findOne({ filter: { _id: decoded.id } });
    } else {
      user =
        (await this.customerUserRepo.findOne({ filter: { _id: decoded.id } })) ||
        (await this.adminUserRepo.findOne({ filter: { _id: decoded.id } }));
    }

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isCustomer = Boolean('walletBalance' in user || decoded.userType === 'customer');
    const role = user.role || (isCustomer ? RoleEnum.customer : RoleEnum.admin);
    const userType = isCustomer ? 'customer' : 'admin';

    // 4. Generate new token pair with new JTI
    const newUuid = randomUUID();
    const accessSecret = this.tokenService.getAccessSecret();
    const refreshSecret = this.tokenService.getRefreshSecret();

    const newAccessToken = await this.tokenService.generateToken({
      payload: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        userType,
        role,
      },
      options: {
        secret: accessSecret,
        expiresIn: '1h',
        jwtid: newUuid,
      },
    });

    const newRefreshToken = await this.tokenService.generateToken({
      payload: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        userType,
        role,
      },
      options: {
        secret: refreshSecret,
        expiresIn: isCustomer ? '30d' : '7d',
        jwtid: newUuid,
      },
    });

    const sanitizedUser = isCustomer ? user : this.sanitizeUser(user);
    const result = {
      user: sanitizedUser,
      admin: isCustomer ? undefined : sanitizedUser,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };

    // 5. Store new response in grace window cache for 25s so concurrent requests succeed
    await this.redisService.setValue({
      key: graceKey,
      value: result,
      ttl: 25,
    });

    // 6. Revoke the old refresh token jti
    await this.redisService.setValue({
      key: revokedKey,
      value: '1',
      ttl: isCustomer ? 30 * 24 * 3600 : 7 * 24 * 3600,
    });

    return result;
  }

  async logout(userPayload: any, body?: LogoutDto): Promise<any> {
    if (userPayload?.id && userPayload?.jti) {
      await this.redisService.setValue({
        key: this.redisService.revokedKey({
          userId: userPayload.id,
          jti: userPayload.jti,
        }),
        value: '1',
        ttl: 24 * 3600,
      });
    }

    if (body?.refreshToken) {
      try {
        const decoded = await this.tokenService.verifyRefreshToken(body.refreshToken);
        if (decoded?.id && decoded?.jti) {
          await this.redisService.setValue({
            key: this.redisService.revokedKey({
              userId: decoded.id,
              jti: decoded.jti,
            }),
            value: '1',
            ttl: 30 * 24 * 3600,
          });
        }
      } catch {
        // ignore if refresh token was already expired or invalid
      }
    }

    return { message: 'Logged out successfully' };
  }
}


