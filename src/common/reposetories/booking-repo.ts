 import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import BaseRepo from './base-repo';
import { InjectModel } from '@nestjs/mongoose';
import { Booking, BookingDocument } from 'src/modules/booking/entities/booking.entity';

@Injectable()
export class BookingRepo extends BaseRepo<BookingDocument> {
  constructor(@InjectModel(Booking.name) protected readonly bookingModel: Model<BookingDocument>) {
    super(bookingModel);
  }
}
