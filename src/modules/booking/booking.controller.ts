import { Body, Controller, Post } from '@nestjs/common';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/booking.dto';

@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) { }

  @Post()
  create(@Body() createBookingDto: CreateBookingDto) {
    return this.bookingService.create(createBookingDto);
  }


}
