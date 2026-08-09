import { Body, Controller, Get, Post } from '@nestjs/common';
import { AmenitiesService } from './amenities.service';
import { CreateAmenitiesDto } from './dto/amenities.dto';

@Controller(['amenitie', 'amenities'])
export class AmenitiesController {
  constructor(private readonly amenitieService: AmenitiesService) { }

  @Post()
  create(@Body() createAmenitiesDto: CreateAmenitiesDto) {
    return this.amenitieService.create(createAmenitiesDto);
  }


}
