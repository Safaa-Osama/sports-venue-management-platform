import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GuestDeviceDocument = HydratedDocument<GuestDevice>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  collection: 'guest_devices',
})
export class GuestDevice {
  @Prop({ type: String, required: true, unique: true, index: true })
  token: string;

  @Prop({ type: String, default: 'unknown' })
  platform: string;

  @Prop({ type: String, enum: ['ar', 'en'], default: 'ar' })
  locale: string;

  @Prop({ type: Date, default: Date.now })
  lastSeenAt: Date;
}

export const GuestDeviceSchema = SchemaFactory.createForClass(GuestDevice);

const guestDeviceModel = MongooseModule.forFeature([
  { name: GuestDevice.name, schema: GuestDeviceSchema },
]);

export default guestDeviceModel;
