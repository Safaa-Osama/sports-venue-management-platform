import { Injectable } from '@nestjs/common';
import { CreateVenueDto } from './dto/venue.dto';

@Injectable()
export class VenueService {
  create(createVenueDto: CreateVenueDto) {
    return 'This action adds a new venue';
  }


}
