import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AdminUser } from 'src/modules/user/entities/admin-user.entity';

export type VenueDocument = HydratedDocument<Venue>;

export class VenueAmenities {
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


@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Venue {
  @Prop({ type: String, required: true })
  venueName: string;

  @Prop({ type: [String], required: true })
  sportsType: string[];

  @Prop({ type: String, required: true })
  address: string;

  @Prop({ type: Number, required: true })
  locationAlt: number;

  @Prop({ type: Number, required: true })
  locationLang: number;

  @Prop({ type: [String], required: true })
  images: string[];

  @Prop({ type: VenueAmenities })
  amenities: VenueAmenities;

  @Prop({ type: Number, required: true })
  endWorkingHours: number;

  @Prop({ type: Number, required: true })
  startWorkingHours: number;

  @Prop({
    type: Number,
    default: function (this: Venue) {
      return (this.endWorkingHours - this.startWorkingHours);
    },
  })
  WorkingHours: number;

  @Prop({ type: Number, required: true })
  defaultHourPrice: number;

  @Prop({ type: [{ hour: Number, pricePerHour: Number }] })
  customHourPrices?: { hour: number; pricePerHour: number }[];

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: AdminUser.name, required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: AdminUser.name })
  updatedBy?: Types.ObjectId;
}

export const VenueSchema = SchemaFactory.createForClass(Venue);

const venueModel = MongooseModule.forFeature([
  { name: Venue.name, schema: VenueSchema },
]);

export default venueModel;
