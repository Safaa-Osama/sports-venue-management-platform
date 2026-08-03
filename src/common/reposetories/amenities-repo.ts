 import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Amenities, AmenitiesDocument } from 'src/modules/amenities/entities/amenities.entity';
import BaseRepo from './base-repo';

@Injectable()
export class amenitiesRepo extends BaseRepo<AmenitiesDocument> {
  constructor(@InjectModel(Amenities.name) protected readonly amenitiesModel: Model<AmenitiesDocument>) {
    super(amenitiesModel);
  }
}
