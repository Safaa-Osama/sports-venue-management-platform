import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

export type NotificationTargetType = 'all' | 'guests' | 'customers' | 'specific_users';

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  collection: 'notifications',
})
export class Notification {
  @Prop({
    type: {
      ar: { type: String, required: true },
      en: { type: String, required: true },
    },
    _id: false,
    required: true,
  })
  title: {
    ar: string;
    en: string;
  };

  @Prop({
    type: {
      ar: { type: String, required: true },
      en: { type: String, required: true },
    },
    _id: false,
    required: true,
  })
  body: {
    ar: string;
    en: string;
  };

  @Prop({ type: String, default: 'BROADCAST', index: true })
  eventType: string;

  @Prop({
    type: String,
    enum: ['all', 'guests', 'customers', 'specific_users'],
    default: 'all',
    index: true,
  })
  targetType: NotificationTargetType;

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }],
    default: [],
    index: true,
  })
  recipientUserIds: Types.ObjectId[];

  @Prop({ type: Object, default: {} })
  data: Record<string, any>;

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }],
    default: [],
    index: true,
  })
  readBy: Types.ObjectId[];

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }],
    default: [],
    index: true,
  })
  deletedBy: Types.ObjectId[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'AdminUser', required: false })
  sentBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ createdAt: -1 });
NotificationSchema.index({ targetType: 1, createdAt: -1 });
NotificationSchema.index({ recipientUserIds: 1, createdAt: -1 });

const notificationModel = MongooseModule.forFeature([
  { name: Notification.name, schema: NotificationSchema },
]);

export default notificationModel;
