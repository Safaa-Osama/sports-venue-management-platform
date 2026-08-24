import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { VenueModule } from './modules/venue/venue.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { BookingModule } from './modules/booking/booking.module';
import { PaymentModule } from './modules/payment/payment.module';
import { CouponModule } from './modules/coupon/coupon.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { RedisModule } from './common/services/redis/redisModule';

import { AmenitiesModule } from './modules/amenities/amenities.module';
import { AdvertisementModule } from './modules/advertisement/advertisement.module';
import { ContactModule } from './modules/contact/contact.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      envFilePath: ['.env.development', '.env.production'],
      isGlobal: true,
    }),
    // Schedule Cron
    ScheduleModule.forRoot(),

    // Mongo DB
    MongooseModule.forRoot(process.env.DB_URI_ATLAS!, {
      onConnectionCreate: (connection: Connection) => {
        connection.on('connected', () => console.log('database connected'));
        connection.on('open', () => console.log('database open'));
        connection.on('disconnected', () =>
          console.log('database disconnected'),
        );
        connection.on('reconnected', () => console.log('database reconnected'));
        connection.on('disconnecting', () =>
          console.log('database disconnecting'),
        );

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
    WalletModule,
    AmenitiesModule,
    RedisModule,
    AdvertisementModule,
    ContactModule,
  ],

  exports: [],
  providers: [AppService],
  controllers: [AppController],
})
export class AppModule {}
