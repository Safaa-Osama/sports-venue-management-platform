import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { JwtModule } from '@nestjs/jwt';
import { VenueModule } from './modules/venue/venue.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { BookingModule } from './modules/booking/booking.module';
import { PaymentModule } from './modules/payment/payment.module';
import { CouponModule } from './modules/coupon/coupon.module';
import { RedisModule } from './common/services/redis/redisModule';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      envFilePath: ['.env.development', '.env.production'],
      isGlobal: true,
    }),

    // Mongo DB
    MongooseModule.forRoot(process.env.DB_LOCAL!, {
      onConnectionCreate: (connection: Connection) => {
        connection.on('connected', () => console.log('database connected'));
        connection.on('open', () => console.log('database open'));
        connection.on('disconnected', () => console.log('database disconnected'));
        connection.on('reconnected', () => console.log('database reconnected'));
        connection.on('disconnecting', () => console.log('database disconnecting'));

        return connection;
      },
    }),
    JwtModule.register({ global: true }),
    VenueModule,
    AuthModule,
    UserModule,
    BookingModule,
    PaymentModule,
    CouponModule,
    RedisModule,
  ],

  exports: [],
  providers: [AppService],
  controllers: [AppController],
})
export class AppModule {}
