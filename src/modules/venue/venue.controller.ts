import { Body, Controller, Post } from '@nestjs/common';
import { CreateVenueDto } from './dto/venue.dto';
import { VenueService } from './venue.service';

@Controller('venue')
export class VenueController {
  constructor(private readonly venueService: VenueService) { }

  @Post()
  create(@Body() createVenueDto: CreateVenueDto) {
    return this.venueService.create(createVenueDto);
  }

}
