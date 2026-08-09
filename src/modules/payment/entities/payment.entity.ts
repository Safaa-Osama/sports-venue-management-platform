import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PaymentDocument = HydratedDocument<Payment>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Payment {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Booking.name' })
  bookingId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User.name' })
  userId: Types.ObjectId;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({ type: String, required: true })
  currency: string;

  @Prop({ type: String, required: true })
  paymentMethod: string;

  @Prop({ type: String, required: true })
  provider: string;

  @Prop({ type: String, required: true })
  transactionId: string;

  @Prop({ type: String, required: true })
  status: string;

  @Prop({ type: Date, required: true })
  paidAt: Date;

}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

const paymentModel = MongooseModule.forFeature([
  { name: Payment.name, schema: PaymentSchema },
]);
export default paymentModel;
