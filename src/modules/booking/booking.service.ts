import { Injectable } from '@nestjs/common';
import { CreateBookingDto } from './dto/booking.dto';

@Injectable()
export class BookingService {
  create(createBookingDto: CreateBookingDto) {
    return 'This action adds a new booking';
  }

}
