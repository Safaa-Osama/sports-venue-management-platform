import { Module } from '@nestjs/common';
import { amenitiesRepo } from 'src/common/reposetories/amenities-repo';
import { AmenitiesController } from './amenities.controller';
import { AmenitiesService } from './amenities.service';
import AmenitiesModel from './entities/amenities.entity';

@Module({
  imports:[
    AmenitiesModel
  ],
  controllers: [AmenitiesController],
  providers: [AmenitiesService,amenitiesRepo],
})
export class AmenitiesModule { }
