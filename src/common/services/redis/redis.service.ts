import { Inject, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { type RedisClientType } from 'redis';

@Injectable()
export class RedisService {
  constructor(@Inject('REDIS_CLIENT') protected readonly client: RedisClientType,) { }

  async setValue({ key, value, ttl, }: { key: string; value: string | object; ttl?: number; }): Promise<void> {
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttl) {
      await this.client.set(key, data, { EX: ttl });
    } else {
      await this.client.set(key, data);
    }
  }

   getValue = async (key: string) => {
        try {
            try {
                return JSON.parse(await this.client.get(key) as string)
            } catch (error) {
                return await this.client.get(key)
            }
        } catch (error) {
            console.log("error to get operation", error)
        }
    }

  async update({
    key,
    value,
    ttl,
  }: {
    key: string;
    value: string | object;
    ttl: number;
  }): Promise<number> {
    try {
      const exists = await this.client.exists(key);
      if (!exists) return 0;
      await this.setValue({ key, value, ttl });
      return 1;
    } catch {
      return 0;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch {
      return -2;
    }
  }

  async exist(key: string): Promise<number> {
    try {
      return await this.client.exists(key);
    } catch {
      return 0;
    }
  }

  async expire({ key, ttl }: { key: string; ttl: number }): Promise<boolean> {
    try {
      const res = await this.client.expire(key, ttl);
      return Boolean(res);
    } catch {
      return false;
    }
  }

  async delKey(key: string | string[]): Promise<number> {
    try {
      if (!key || (Array.isArray(key) && key.length === 0)) return 0;
      return await this.client.del(key);
    } catch {
      return 0;
    }
  }

  async Keys(pattern: string): Promise<string[]> {
    try {
      const queryPattern = pattern.endsWith('*') ? pattern : `${pattern}*`;
      return await this.client.keys(queryPattern);
    } catch {
      return [];
    }
  }

  revokedKey({ userId, jti }: { userId: Types.ObjectId | string; jti: string }): string {
    return `revoke-token::${userId}::${jti}`;
  }

  getKey(userId: Types.ObjectId | string): string {
    return `revoke-token::${userId}`;
  }

  otpKey(identifier: string): string {
    return `otp::${identifier}`;
  }

  maxOtp(identifier: string): string {
    return `otp::${identifier}::max_tries`;
  }

  blockOtp(identifier: string): string {
    return `otp::${identifier}::blocked`;
  }

  async inc(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch {
      return 0;
    }
  }

  async acquireLock(key: string, ttlSeconds: number = 5): Promise<boolean> {
    try {
      const res = await this.client.set(key, 'locked', { NX: true, EX: ttlSeconds });
      return res === 'OK';
    } catch {
      // If redis is unavailable or errors, return true so system gracefully falls back
      return true;
    }
  }

  async releaseLock(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch {
      return 0;
    }
  }
}

export default RedisService;