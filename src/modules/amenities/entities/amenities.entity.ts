import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
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
  @Prop({ type: Types.ObjectId, ref: Venue.name })
  venueId: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  Parking: boolean;

  @Prop({ type: Boolean, default: false })
  Cafeteria: boolean;

  @Prop({ type: Boolean, default: false })
  Shower: boolean;

  @Prop({ type: Boolean, default: false })
  ChangingRoom: boolean;

  @Prop({ type: Boolean, default: false })
  Toilets: boolean;

  @Prop({ type: Boolean, default: false })
  WiFi: boolean;

  @Prop({ type: Boolean, default: false })
  Lockers: boolean;

  @Prop({ type: Boolean, default: false })
  FloodLights: boolean;

  @Prop({ type: Boolean, default: false })
  DrinkingWater: boolean;

  @Prop({ type: Boolean, default: false })
  FirstAid: boolean;

  @Prop({ type: Boolean, default: false })
  PrayerArea: boolean;

  @Prop({ type: Boolean, default: false })
  EquipmentRental: boolean;
}

export const AmenitiesSchema = SchemaFactory.createForClass(Amenities);

const AmenitiesModel = MongooseModule.forFeature([
  { name: Amenities.name, schema: AmenitiesSchema },
]);
export default AmenitiesModel;
