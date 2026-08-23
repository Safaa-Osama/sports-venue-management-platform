import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ContactDocument = HydratedDocument<Contact>;

export enum ContactStatusEnum {
  PENDING = 'PENDING',
  CONTACTED = 'CONTACTED',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Contact {
  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, trim: true })
  phone: string;

  @Prop({ type: String, trim: true, default: null })
  email?: string;

  @Prop({ type: String, trim: true, default: null })
  company?: string;

  @Prop({ type: String, trim: true, default: 'BANNER' })
  campaignType?: string;

  @Prop({ type: String, trim: true, default: '' })
  message?: string;

  @Prop({
    type: String,
    enum: Object.values(ContactStatusEnum),
    default: ContactStatusEnum.PENDING,
  })
  status: ContactStatusEnum;

  @Prop({ type: String, default: 'MOBILE_APP' })
  source: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId?: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  createdAt?: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt?: Date;
}

export const ContactSchema = SchemaFactory.createForClass(Contact);

const ContactModel = MongooseModule.forFeature([
  { name: Contact.name, schema: ContactSchema },
]);
export default ContactModel;
