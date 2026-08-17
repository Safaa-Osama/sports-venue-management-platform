import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  AdvertisementPositionEnum,
  AdvertisementStatusEnum,
} from 'src/common/enums/advertisementEnum';
import { AdminUser } from 'src/modules/user/entities/admin-user.entity';

export type AdvertisementDocument = HydratedDocument<Advertisement>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Advertisement {
  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ type: String, trim: true, maxlength: 1000, default: '' })
  description: string;

  @Prop({ type: String, required: true, trim: true })
  image: string;

  @Prop({ type: String, trim: true, default: null })
  linkUrl?: string;

  @Prop({
    type: String,
    enum: Object.values(AdvertisementPositionEnum),
  })
  position?: AdvertisementPositionEnum;

  @Prop({
    type: String,
    enum: Object.values(AdvertisementStatusEnum),
    default: AdvertisementStatusEnum.active,
  })
  status?: AdvertisementStatusEnum;

  @Prop({ type: Date, default: null })
  startDate?: Date;

  @Prop({ type: Date, default: null })
  endDate?: Date;

  @Prop({ type: Types.ObjectId, ref: AdminUser.name, index: true })
  createdBy?: Types.ObjectId;
}

export const AdvertisementSchema = SchemaFactory.createForClass(Advertisement);


const advertisementModel = MongooseModule.forFeature([
  { name: Advertisement.name, schema: AdvertisementSchema },
]);

export default advertisementModel;
