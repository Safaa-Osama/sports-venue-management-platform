import { MongooseModule, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AmenitiesDocument = HydratedDocument<Amenities>;

@Schema({
  timestamps: true,
  strictQuery: true,
  strict: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Amenities  {
  
}

export const AmenitiesSchema = SchemaFactory.createForClass(Amenities);

const AmenitiesModel = MongooseModule.forFeature([
  { name: Amenities.name, schema: AmenitiesSchema },
]);
export default AmenitiesModel;
