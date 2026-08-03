import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type VenueDocument = HydratedDocument<Venue>;

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
}

export const VenueSchema = SchemaFactory.createForClass(Venue);

const venueModel = MongooseModule.forFeature([
  { name: Venue.name, schema: VenueSchema },
]);
export default venueModel;
