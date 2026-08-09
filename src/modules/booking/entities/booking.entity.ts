import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BookingStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from 'src/common/enums/bookingEnum';

export type BookingDocument = HydratedDocument<Booking>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Booking {
  @Prop({ type: Types.ObjectId, ref: 'CustomerUser', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Venue', required: true })
  venueId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  date: Date;

  @Prop({ type: Number, required: true })
  startTime: number;

  @Prop({ type: Number, required: true })
  endTime: number;

  @Prop({ type: Number, required: true })
  totalPrice: number;

  @Prop({ type: String, enum: BookingStatusEnum, default: BookingStatusEnum.pending })
  status: BookingStatusEnum;

  @Prop({ type: String, enum: PaymentStatusEnum, default: PaymentStatusEnum.unpaid })
  paymentStatus: PaymentStatusEnum;

  @Prop({ type: String, required: true })
  bookingCode: string;

  @Prop({ type: String, required: true })
  qrCode: string;

  @Prop({ type: String })
  couponCode?: string;

  @Prop({ type: Number, default: 0 })
  discountAmount?: number;

  @Prop({ type: Number })
  finalPrice?: number;

  @Prop({ type: String, enum: PaymentMethodEnum })
  paymentMethod?: PaymentMethodEnum;

  @Prop({ type: Date })
  expiresAt?: Date;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

const BookingModel = MongooseModule.forFeature([
  { name: Booking.name, schema: BookingSchema },
]);

export default BookingModel;
