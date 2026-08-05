import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CustomerUserDocument = HydratedDocument<CustomerUser>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class CustomerUser {
  @Prop({ type: String, required: true })
  userName: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  phone: string;

  @Prop({ type: String })
  avatar?: string;

  @Prop({ type: String })
  position?: string;

  @Prop({ type: Number, default: 0 })
  walletBalance: number;
}

export const CustomerUserSchema = SchemaFactory.createForClass(CustomerUser);

const customerUserModel = MongooseModule.forFeature([
  { name: CustomerUser.name, schema: CustomerUserSchema },
]);

export default customerUserModel;
