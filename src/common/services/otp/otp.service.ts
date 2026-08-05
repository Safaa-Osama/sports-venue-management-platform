import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import RedisService from '../redis/redis.service';
import { randomInt } from 'crypto';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_TTL = 300; // 5 minutes
  private readonly RATE_LIMIT_TTL = 60; // 1 minute cooldown

  constructor(private readonly redisService: RedisService) {}

  private getOtpKey(phone: string): string {
    return `otp:${phone}`;
  }

  private getRateLimitKey(phone: string): string {
    return `otp_rate:${phone}`;
  }

  async sendOtp(phone: string): Promise<{ success: boolean; message: string; devCode?: string }> {
    const rateLimitKey = this.getRateLimitKey(phone);
    const isRateLimited = await this.redisService.getValue(rateLimitKey);

    if (isRateLimited) {
      throw new BadRequestException('Please wait 60 seconds before requesting another OTP.');
    }

    // Generate 6-digit OTP
    const otpCode = randomInt(100000, 999999).toString();
    const otpKey = this.getOtpKey(phone);

    // Save OTP and rate limit in Redis
    await this.redisService.setValue({ key: otpKey, value: otpCode, ttl: this.OTP_TTL });
    await this.redisService.setValue({ key: rateLimitKey, value: '1', ttl: this.RATE_LIMIT_TTL });

    // Log for Dev mode / SMS provider integration placeholder
    this.logger.log(`[DEV MODE] OTP for ${phone}: ${otpCode}`);

    return {
      success: true,
      message: 'OTP sent successfully via SMS/WhatsApp.',
      devCode: process.env.NODE_ENV !== 'production' ? otpCode : undefined,
    };
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    const otpKey = this.getOtpKey(phone);
    const storedOtp = await this.redisService.getValue(otpKey);

    if (!storedOtp || String(storedOtp) !== String(code)) {
      throw new BadRequestException('Invalid or expired OTP code.');
    }

    // Delete OTP once verified
    await this.redisService.delKey(otpKey);
    return true;
  }
}
