import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions, JwtVerifyOptions } from '@nestjs/jwt';
import { CustomerUserRepo } from 'src/common/repositories/customer-user-repo';
import { AdminUserRepo } from 'src/common/repositories/admin-user-repo';
import { CustomerStatusEnum } from 'src/common/enums/userEnum';
import RedisService from '../redis/redis.service';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly customerUserRepo: CustomerUserRepo,
    private readonly adminUserRepo: AdminUserRepo,
    private readonly redisService: RedisService,
  ) { }

  generateToken({
    payload,
    options,
  }: {
    payload: object;
    options?: JwtSignOptions;
  }): Promise<string> {
    return this.jwtService.signAsync(payload, options);
  }

  verifyToken({
    token,
    options,
  }: {
    token: string;
    options?: JwtVerifyOptions;
  }): Promise<object> {
    return this.jwtService.verifyAsync(token, options);
  }

  getAccessSecret(): string {
    return (
      process.env.JWT_ACCESS_SECRET ||
      process.env.SECRET_KEY_USER ||
      'default_access_secret'
    );
  }

  getRefreshSecret(): string {
    return (
      process.env.JWT_REFRESH_SECRET ||
      process.env.REFRESH_SECRET_KEY_USER ||
      'default_refresh_secret'
    );
  }

  async authenticateToken_fetchUser(token: string) {
    const secret = this.getAccessSecret();
    let decoded: any;

    try {
      decoded = await this.verifyToken({ token, options: { secret } });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!decoded?.jti || !decoded?.id) {
      throw new UnauthorizedException('Invalid token payload');
    }

    let user: any = null;

    if (decoded.userType === 'customer') {
      user = await this.customerUserRepo.findOne({
        filter: { _id: decoded.id },
      });
    } else if (decoded.userType === 'admin') {
      user = await this.adminUserRepo.findOne({
        filter: { _id: decoded.id },
      });
    } else {
      user =
        (await this.customerUserRepo.findOne({
          filter: { _id: decoded.id },
        })) ||
        (await this.adminUserRepo.findOne({ filter: { _id: decoded.id } }));
    }

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status === CustomerStatusEnum.suspended) {
      throw new ForbiddenException(
        'Your account has been suspended. Please contact support.',
      );
    }

    const revoked = await this.redisService.getValue(
      this.redisService.revokedKey({
        userId: user._id,
        jti: decoded.jti,
      }),
    );

    if (revoked) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return { user, decoded };
  }
}
