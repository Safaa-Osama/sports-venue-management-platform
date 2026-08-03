import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PaymentDocument = HydratedDocument<Payment>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Payment {


}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

const paymentModel = MongooseModule.forFeature([
  { name: Payment.name, schema: PaymentSchema },
]);
export default paymentModel;
