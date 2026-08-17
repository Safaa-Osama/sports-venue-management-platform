import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import BaseRepo from './base-repo';
import { InjectModel } from '@nestjs/mongoose';
import { Venue, VenueDocument } from 'src/modules/venue/entities/venue.entity';

@Injectable()
export class VenueRepo extends BaseRepo<VenueDocument> {
  constructor(
    @InjectModel(Venue.name)
    protected readonly venueModel: Model<VenueDocument>,
  ) {
    super(venueModel);
  }
}
