import { Module } from '@nestjs/common';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { BookingRepo } from 'src/common/reposetories/booking-repo';
import bookingModel from './entities/booking.entity';

@Module({
  imports:[bookingModel],
  controllers: [BookingController],
  providers: [BookingService,BookingRepo],
})
export class BookingModule {}
