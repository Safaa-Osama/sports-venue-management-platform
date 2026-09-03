import { Global, Module, Logger } from '@nestjs/common';
import { createClient } from 'redis';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async () => {
        const logger = new Logger('RedisModule');
        const redisUri = process.env.REDIS_URI;
        if (!redisUri) {
          logger.warn('REDIS_URI not configured. Redis will run in offline mode.');
          return null;
        }

        const isTls = redisUri.startsWith('rediss://');

        const redis = createClient({
          url: redisUri,
          pingInterval: 5000, // Sends PING every 5s to keep connection warm & prevent idle ECONNRESET
          socket: {
            reconnectStrategy: (retries) => {
              if (retries > 50) {
                logger.warn('Max reconnection attempts reached. Backing off to 5s.');
                return 5000;
              }
              return Math.min(retries * 100, 3000);
            },
            connectTimeout: 10000,
            keepAlive: true,
            noDelay: true,
            tls: isTls ? true : undefined,
          },
        });

        redis.on('error', (err: any) => {
          const msg = err?.message || String(err);
          if (msg.includes('ECONNRESET') || err?.code === 'ECONNRESET') {
            logger.warn('Redis socket disconnected (ECONNRESET). Auto-reconnecting in background...');
          } else {
            logger.warn(`Redis Error: ${msg}`);
          }
        });

        redis.on('reconnecting', () => {
          logger.log('Redis client reconnecting...');
        });

        redis.on('ready', () => {
          logger.log('Redis client ready.');
        });

        try {
          await redis.connect();
        } catch (err: any) {
          logger.warn(`Initial connection failed, will retry in background: ${err?.message || err}`);
        }

        return redis;
      },
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}

