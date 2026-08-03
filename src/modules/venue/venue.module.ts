import { Module } from '@nestjs/common';
import { VenueService } from './venue.service';
import { VenueController } from './venue.controller';
import { VenueRepo } from 'src/common/reposetories/venue-repo';
import venueModel from './entities/venue.entity';

@Module({
  imports:[venueModel],
  controllers: [VenueController],
  providers: [VenueService,VenueRepo],
})
export class VenueModule {}
