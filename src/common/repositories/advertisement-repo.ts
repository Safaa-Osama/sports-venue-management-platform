import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import BaseRepo from './base-repo';
import { Advertisement, AdvertisementDocument } from 'src/modules/advertisement/entities/advertisement.entity';

@Injectable()
export class AdvertisementRepo extends BaseRepo<AdvertisementDocument> {
    constructor(
        @InjectModel(Advertisement.name)
        protected readonly advertisementModel: Model<AdvertisementDocument>,
    ) {
        super(advertisementModel);
    }

}