import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AdminUser } from 'src/modules/user/entities/admin-user.entity';
import { Venue } from 'src/modules/venue/entities/venue.entity';

export type AmenitiesDocument = HydratedDocument<Amenities>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Amenities {
  @Prop({ type: Types.ObjectId, ref: Venue.name, required: true })
  venueId: Types.ObjectId;

  @Prop({ type: String, default: '' })
  amenityName: string;


  @Prop({ type: String, default: 'icon image url' })
  iconUrl: string;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean; 

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Types.ObjectId, ref: AdminUser.name })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: AdminUser.name })
  updatedBy: Types.ObjectId;
}

export const AmenitiesSchema = SchemaFactory.createForClass(Amenities);

const AmenitiesModel = MongooseModule.forFeature([
  { name: Amenities.name, schema: AmenitiesSchema },
]);
export default AmenitiesModel;
