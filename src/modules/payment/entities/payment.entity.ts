import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  PaymentMethodEnum,
  PaymentStatusEnum,
} from 'src/common/enums/bookingEnum';
import { Booking } from 'src/modules/booking/entities/booking.entity';
import { CustomerUser } from 'src/modules/user/entities/customer-user.entity';

export type PaymentDocument = HydratedDocument<Payment>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Payment {
  @Prop({ required: true, type: Types.ObjectId, ref: Booking.name })
  bookingId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: CustomerUser.name })
  userId: Types.ObjectId;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({ type: String, enum: PaymentMethodEnum, required: true })
  paymentMethod: PaymentMethodEnum;

  @Prop({ type: String, required: true, unique: true })
  transactionId: string;

  @Prop({
    type: String,
    enum: PaymentStatusEnum,
    default: PaymentStatusEnum.unpaid,
  })
  status: PaymentStatusEnum;

  @Prop({ type: Date, required: false })
  paidAt?: Date;

  @Prop({ type: Number, default: 0 })
  refundedAmount?: number;

  @Prop({ type: String, required: false })
  refundReason?: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

const paymentModel = MongooseModule.forFeature([
  { name: Payment.name, schema: PaymentSchema },
]);
export default paymentModel;
