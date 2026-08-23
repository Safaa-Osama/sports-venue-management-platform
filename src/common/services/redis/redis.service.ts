import { Inject, Injectable, Optional } from '@nestjs/common';
import { Types } from 'mongoose';
import { type RedisClientType } from 'redis';

const REDIS_OP_TIMEOUT_MS = 2500;

async function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), REDIS_OP_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    return fallback;
  }
}

@Injectable()
export class RedisService {
  constructor(
    @Optional() @Inject('REDIS_CLIENT') protected readonly client?: RedisClientType,
  ) {}

  private isAvailable(): boolean {
    return Boolean(this.client && (this.client.isReady || this.client.isOpen));
  }

  async setValue({
    key,
    value,
    ttl,
  }: {
    key: string;
    value: string | object;
    ttl?: number;
  }): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      const data = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttl) {
        await withTimeout(this.client!.set(key, data, { EX: ttl }), null);
      } else {
        await withTimeout(this.client!.set(key, data), null);
      }
    } catch {
      // Redis errors should not interrupt application operations
    }
  }

  getValue = async (key: string): Promise<any> => {
    if (!this.isAvailable()) return null;
    try {
      const raw = await withTimeout(this.client!.get(key), null);
      if (!raw) return null;
      try {
        return JSON.parse(raw as string);
      } catch {
        return raw;
      }
    } catch {
      return null;
    }
  };

  async update({
    key,
    value,
    ttl,
  }: {
    key: string;
    value: string | object;
    ttl: number;
  }): Promise<number> {
    if (!this.isAvailable()) return 0;
    try {
      const exists = await withTimeout(this.client!.exists(key), 0);
      if (!exists) return 0;
      await this.setValue({ key, value, ttl });
      return 1;
    } catch {
      return 0;
    }
  }

  async ttl(key: string): Promise<number> {
    if (!this.isAvailable()) return -2;
    try {
      const res = await withTimeout(this.client!.ttl(key), -2);
      return typeof res === 'number' ? res : -2;
    } catch {
      return -2;
    }
  }

  async exist(key: string): Promise<number> {
    if (!this.isAvailable()) return 0;
    try {
      const res = await withTimeout(this.client!.exists(key), 0);
      return typeof res === 'number' ? res : 0;
    } catch {
      return 0;
    }
  }

  async expire({ key, ttl }: { key: string; ttl: number }): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      const res = await withTimeout<any>(this.client!.expire(key, ttl), false);
      return Boolean(res);
    } catch {
      return false;
    }
  }

  async delKey(key: string | string[]): Promise<number> {
    if (!this.isAvailable()) return 0;
    try {
      if (!key || (Array.isArray(key) && key.length === 0)) return 0;
      const res = await withTimeout(this.client!.del(key), 0);
      return typeof res === 'number' ? res : 0;
    } catch {
      return 0;
    }
  }

  async Keys(pattern: string): Promise<string[]> {
    if (!this.isAvailable()) return [];
    try {
      const queryPattern = pattern.endsWith('*') ? pattern : `${pattern}*`;
      const res = await withTimeout(this.client!.keys(queryPattern), []);
      return Array.isArray(res) ? res : [];
    } catch {
      return [];
    }
  }

  revokedKey({
    userId,
    jti,
  }: {
    userId: Types.ObjectId | string;
    jti: string;
  }): string {
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
    if (!this.isAvailable()) return 0;
    try {
      const res = await withTimeout(this.client!.incr(key), 0);
      return typeof res === 'number' ? res : 0;
    } catch {
      return 0;
    }
  }

  async acquireLock(key: string, ttlSeconds: number = 5): Promise<boolean> {
    if (!this.isAvailable()) return true;
    try {
      const res = await withTimeout(
        this.client!.set(key, 'locked', {
          NX: true,
          EX: ttlSeconds,
        }),
        'OK',
      );
      return res === 'OK';
    } catch {
      // If redis is unavailable or errors, return true so system gracefully falls back
      return true;
    }
  }

  async releaseLock(key: string): Promise<number> {
    if (!this.isAvailable()) return 0;
    try {
      const res = await withTimeout(this.client!.del(key), 0);
      return typeof res === 'number' ? res : 0;
    } catch {
      return 0;
    }
  }
}

export default RedisService;

