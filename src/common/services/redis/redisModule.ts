import { Global, Module } from '@nestjs/common';
import { createClient } from 'redis';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async () => {
        const redisUri = process.env.REDIS_URI;
        if (!redisUri) {
          console.warn('[RedisModule] REDIS_URI not configured. Redis will run in offline mode.');
          return null;
        }

        const isTls = redisUri.startsWith('rediss://');

        const redis = createClient({
          url: redisUri,
          pingInterval: 15000, // Sends PING every 15s to keep TLS connection active & prevent ECONNRESET
          socket: {
            reconnectStrategy: (retries) => {
              if (retries > 20) {
                console.warn('[Redis] Max reconnection attempts reached. Backing off.');
                return 5000;
              }
              const delay = Math.min(retries * 200, 3000);
              return delay;
            },
            connectTimeout: 5000,
            keepAlive: true,
            tls: isTls ? true : undefined,
          },
        });

        redis.on('error', (err) => {
          console.warn('[Redis Error]:', err?.message || err);
        });

        redis.on('connect', () => {
          console.log('[Redis] Connected successfully');
        });

        redis.on('ready', () => {
          console.log('[Redis] Client ready for commands');
        });

        redis.on('reconnecting', () => {
          console.log('[Redis] Reconnecting...');
        });

        try {
          await redis.connect();
        } catch (err: any) {
          console.warn('[RedisModule] Initial connection failed, will retry in background:', err?.message || err);
        }

        return redis;
      },
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}

