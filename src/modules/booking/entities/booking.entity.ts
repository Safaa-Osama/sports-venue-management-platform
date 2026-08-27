import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  BookingStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
} from 'src/common/enums/bookingEnum';
import { CustomerUser } from 'src/modules/user/entities/customer-user.entity';
import { Venue } from 'src/modules/venue/entities/venue.entity';

export type BookingDocument = HydratedDocument<Booking>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Booking {
  @Prop({ type: Types.ObjectId, ref: CustomerUser.name, required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Venue.name, required: true })
  venueId: Types.ObjectId;

  @Prop({ type: String, index: true })
  groupId?: string;

  @Prop({ type: Date, required: true })
  date: Date;

  @Prop({ type: Number, required: true })
  startTime: number;

  @Prop({ type: Number, required: true })
  endTime: number;

  @Prop({ type: Number, required: true })
  totalPrice: number;

  @Prop({
    type: String,
    enum: BookingStatusEnum,
    default: BookingStatusEnum.pending,
  })
  status: BookingStatusEnum;

  @Prop({
    type: String,
    enum: PaymentStatusEnum,
    default: PaymentStatusEnum.unpaid,
  })
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

  @Prop({ type: Number, default: 0 })
  paidAmount?: number;

  @Prop({ type: Number, default: 0 })
  remainingAmount?: number;

  @Prop({ type: String, enum: PaymentMethodEnum })
  paymentMethod?: PaymentMethodEnum;

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ type: String, index: true })
  idempotencyKey?: string;

  @Prop({ type: String })
  requestHash?: string;

  @Prop({ type: Boolean, default: false })
  morningReminderSent?: boolean;

  @Prop({ type: Boolean, default: false })
  twoHourReminderSent?: boolean;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
BookingSchema.index({ userId: 1, idempotencyKey: 1 }, { sparse: true });
BookingSchema.index(
  { venueId: 1, date: 1, startTime: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          BookingStatusEnum.confirmed,
          BookingStatusEnum.pending,
          BookingStatusEnum.completed,
        ],
      },
    },
  },
);

const BookingModel = MongooseModule.forFeature([
  { name: Booking.name, schema: BookingSchema },
]);

export default BookingModel;
