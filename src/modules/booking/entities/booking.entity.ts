import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BookingDocument = HydratedDocument<Booking>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Booking {


}

export const BookingSchema = SchemaFactory.createForClass(Booking);

const BookingModel = MongooseModule.forFeature([
  { name: Booking.name, schema: BookingSchema },
]);

export default BookingModel;
