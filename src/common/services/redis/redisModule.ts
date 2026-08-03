import { Global, Module } from '@nestjs/common';
import { createClient } from 'redis';

@Global()
@Module({
    imports: [],
    controllers: [],
    providers: [{
        provide: "REDIS_CLIENT",
        useFactory: async () => {
            const redis = createClient({ url: process.env.REDIS_URI })

            await redis.connect();
            console.log("Redis connected successfully")
            redis.on("error", (err) => {
                console.log(err)
            })
            return redis
        }
    }],
    exports: ["REDIS_CLIENT"],
})


export class RedisModule { }