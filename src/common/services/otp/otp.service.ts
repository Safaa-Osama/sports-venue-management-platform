import { BadRequestException, Injectable } from '@nestjs/common';
import RedisService from '../redis/redis.service';
import { randomInt } from 'crypto';

@Injectable()
export class OtpService {
  private readonly OTP_TTL = 300; 
  private readonly RATE_LIMIT_TTL = 60; 

  constructor(private readonly redisService: RedisService) {}

  private getOtpKey(phone: string): string {
    return `otp::${phone}`;
  }

  private getRateLimitKey(phone: string): string {
    return `otp_rate::${phone}`;
  }

  async sendOtp(phone: string): Promise<{ success: boolean; message: string; devCode?: string }> {
    const rateLimitKey = this.getRateLimitKey(phone);
    const isRateLimited = await this.redisService.getValue(rateLimitKey);

    if (isRateLimited) {
      throw new BadRequestException('Please wait 60 seconds before requesting another OTP.');
    }

    const otpCode = randomInt(100000, 999999).toString();
    const otpKey = this.getOtpKey(phone);

    await this.redisService.setValue({ key: otpKey, value: otpCode, ttl: this.OTP_TTL });
    await this.redisService.setValue({ key: rateLimitKey, value: '1', ttl: this.RATE_LIMIT_TTL });

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

    await this.redisService.delKey(otpKey);
    return true;
  }
}
