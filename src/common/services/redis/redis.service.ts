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

interface InMemoryLock {
  expiresAt: number;
  timer?: NodeJS.Timeout;
}

interface InMemoryKV {
  value: any;
  expiresAt?: number;
  timer?: NodeJS.Timeout;
}

@Injectable()
export class RedisService {
  private static readonly inMemoryLocks = new Map<string, InMemoryLock>();
  private static readonly inMemoryKV = new Map<string, InMemoryKV>();

  constructor(
    @Optional() @Inject('REDIS_CLIENT') protected readonly client?: RedisClientType,
  ) {}

  private isAvailable(): boolean {
    return Boolean(this.client && (this.client.isReady || this.client.isOpen));
  }

  private acquireInMemoryLock(key: string, ttlSeconds: number = 5): boolean {
    const now = Date.now();
    const existing = RedisService.inMemoryLocks.get(key);
    if (existing) {
      if (existing.expiresAt > now) {
        return false;
      }
      if (existing.timer) {
        clearTimeout(existing.timer);
      }
      RedisService.inMemoryLocks.delete(key);
    }

    const expiresAt = now + ttlSeconds * 1000;
    const timer = setTimeout(() => {
      const entry = RedisService.inMemoryLocks.get(key);
      if (entry && entry.expiresAt <= Date.now()) {
        RedisService.inMemoryLocks.delete(key);
      }
    }, ttlSeconds * 1000);

    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }

    RedisService.inMemoryLocks.set(key, { expiresAt, timer });
    return true;
  }

  private releaseInMemoryLock(key: string): number {
    const existing = RedisService.inMemoryLocks.get(key);
    if (existing) {
      if (existing.timer) {
        clearTimeout(existing.timer);
      }
      RedisService.inMemoryLocks.delete(key);
      return 1;
    }
    return 0;
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
    if (!this.isAvailable()) {
      const existing = RedisService.inMemoryKV.get(key);
      if (existing?.timer) {
        clearTimeout(existing.timer);
      }
      const expiresAt = ttl ? Date.now() + ttl * 1000 : undefined;
      let timer: any;
      if (ttl) {
        timer = setTimeout(() => {
          RedisService.inMemoryKV.delete(key);
        }, ttl * 1000);
        if (timer && typeof timer.unref === 'function') timer.unref();
      }
      RedisService.inMemoryKV.set(key, { value, expiresAt, timer });
      return;
    }
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
    if (!this.isAvailable()) {
      const entry = RedisService.inMemoryKV.get(key);
      if (!entry) return null;
      if (entry.expiresAt && entry.expiresAt <= Date.now()) {
        if (entry.timer) clearTimeout(entry.timer);
        RedisService.inMemoryKV.delete(key);
        return null;
      }
      return entry.value;
    }
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
    if (!this.isAvailable()) {
      const exists = RedisService.inMemoryKV.has(key);
      if (!exists) return 0;
      await this.setValue({ key, value, ttl });
      return 1;
    }
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
    if (!this.isAvailable()) {
      const entry = RedisService.inMemoryKV.get(key);
      if (!entry) return -2;
      if (!entry.expiresAt) return -1;
      const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
      return remaining > 0 ? remaining : -2;
    }
    try {
      const res = await withTimeout(this.client!.ttl(key), -2);
      return typeof res === 'number' ? res : -2;
    } catch {
      return -2;
    }
  }

  async exist(key: string): Promise<number> {
    if (!this.isAvailable()) {
      const entry = RedisService.inMemoryKV.get(key);
      if (!entry) return 0;
      if (entry.expiresAt && entry.expiresAt <= Date.now()) {
        if (entry.timer) clearTimeout(entry.timer);
        RedisService.inMemoryKV.delete(key);
        return 0;
      }
      return 1;
    }
    try {
      const res = await withTimeout(this.client!.exists(key), 0);
      return typeof res === 'number' ? res : 0;
    } catch {
      return 0;
    }
  }

  async expire({ key, ttl }: { key: string; ttl: number }): Promise<boolean> {
    if (!this.isAvailable()) {
      const entry = RedisService.inMemoryKV.get(key);
      if (!entry) return false;
      if (entry.timer) clearTimeout(entry.timer);
      entry.expiresAt = Date.now() + ttl * 1000;
      entry.timer = setTimeout(() => {
        RedisService.inMemoryKV.delete(key);
      }, ttl * 1000);
      if (entry.timer && typeof entry.timer.unref === 'function') entry.timer.unref();
      return true;
    }
    try {
      const res = await withTimeout<any>(this.client!.expire(key, ttl), false);
      return Boolean(res);
    } catch {
      return false;
    }
  }

  async delKey(key: string | string[]): Promise<number> {
    const keys = Array.isArray(key) ? key : [key];
    let deletedCount = 0;
    for (const k of keys) {
      const entry = RedisService.inMemoryKV.get(k);
      if (entry) {
        if (entry.timer) clearTimeout(entry.timer);
        RedisService.inMemoryKV.delete(k);
        deletedCount++;
      }
    }
    if (!this.isAvailable()) return deletedCount;
    try {
      if (!key || (Array.isArray(key) && key.length === 0)) return deletedCount;
      const res = await withTimeout(this.client!.del(key), 0);
      return typeof res === 'number' ? res : deletedCount;
    } catch {
      return deletedCount;
    }
  }

  async Keys(pattern: string): Promise<string[]> {
    if (!this.isAvailable()) {
      const prefix = pattern.replace(/\*$/, '');
      const matched: string[] = [];
      const now = Date.now();
      for (const [k, v] of RedisService.inMemoryKV.entries()) {
        if (v.expiresAt && v.expiresAt <= now) {
          if (v.timer) clearTimeout(v.timer);
          RedisService.inMemoryKV.delete(k);
          continue;
        }
        if (k.startsWith(prefix)) matched.push(k);
      }
      return matched;
    }
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
    if (!this.isAvailable()) {
      const existing = RedisService.inMemoryKV.get(key);
      let num = 0;
      if (existing) {
        num = Number(existing.value) || 0;
      }
      num += 1;
      RedisService.inMemoryKV.set(key, { value: num });
      return num;
    }
    try {
      const res = await withTimeout(this.client!.incr(key), 0);
      return typeof res === 'number' ? res : 0;
    } catch {
      return 0;
    }
  }

  async acquireLock(key: string, ttlSeconds: number = 5): Promise<boolean> {
    if (!this.isAvailable()) {
      return this.acquireInMemoryLock(key, ttlSeconds);
    }
    try {
      const res = await withTimeout(
        this.client!.set(key, 'locked', {
          NX: true,
          EX: ttlSeconds,
        }),
        null,
      );
      if (res === 'OK') {
        return true;
      }
      if (res === null && this.isAvailable()) {
        return false;
      }
      return this.acquireInMemoryLock(key, ttlSeconds);
    } catch {
      return this.acquireInMemoryLock(key, ttlSeconds);
    }
  }

  async releaseLock(key: string): Promise<number> {
    let released = 0;
    released += this.releaseInMemoryLock(key);
    if (this.isAvailable()) {
      try {
        const res = await withTimeout(this.client!.del(key), 0);
        if (typeof res === 'number' && res > 0) {
          released += res;
        }
      } catch {
        // ignore
      }
    }
    return released;
  }
}

export default RedisService;

