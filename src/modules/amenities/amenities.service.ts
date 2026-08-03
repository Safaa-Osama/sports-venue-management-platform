import { Injectable } from '@nestjs/common';
import { CreateAmenitiesDto } from './dto/amenities.dto';

@Injectable()
export class AmenitiesService {
  create(createAmenitiesDto: CreateAmenitiesDto) {
    return 'This action adds a new amenities';
  }

  findAll() {
    return `This action returns all amenitie`;
  }

  findOne(id: number) {
    return `This action returns a #${id} amenitie`;
  }

}