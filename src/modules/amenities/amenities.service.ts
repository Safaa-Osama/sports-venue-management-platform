import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { amenitiesRepo } from 'src/common/reposetories/amenities-repo';
import { VenueRepo } from 'src/common/reposetories/venue-repo';
import { CreateAmenitiesDto, UpdateAmenitiesDto } from './dto/amenities.dto';
import { Types } from 'mongoose';

@Injectable()
export class AmenitiesService {
  constructor(
    private readonly amenitiesRepo: amenitiesRepo,
    private readonly venueRepo: VenueRepo,
  ) {}

  async create(body: CreateAmenitiesDto) {
    const { venueId } = body;

    if (!Types.ObjectId.isValid(venueId)) {
      throw new BadRequestException('Invalid venueId format');
    }

    const venueExists = await this.venueRepo.findById(venueId);
    if (!venueExists) {
      throw new NotFoundException(`Venue with ID ${venueId} not found`);
    }

    const existing = await this.amenitiesRepo.findOne({
      filter: { venueId: new Types.ObjectId(venueId) },
    });
    if (existing) {
      throw new ConflictException(
        `Amenities for venue ${venueId} already exist. Use update instead.`,
      );
    }

    const amenities = await this.amenitiesRepo.create({
      ...body,
      venueId: new Types.ObjectId(venueId),
    });

    if (!amenities) {
      throw new BadRequestException('Failed to create amenities record');
    }

    return amenities;
  }

  async findAll() {
    return this.amenitiesRepo.find();
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }

    const amenity = await this.amenitiesRepo.findById(id);
    if (!amenity) {
      throw new NotFoundException(`Amenities record with ID ${id} not found`);
    }

    return amenity;
  }

  async findByVenueId(venueId: string) {
    if (!Types.ObjectId.isValid(venueId)) {
      throw new BadRequestException('Invalid venueId format');
    }

    const amenity = await this.amenitiesRepo.findOne({
      filter: { venueId: new Types.ObjectId(venueId) },
    });

    if (!amenity) {
      throw new NotFoundException(
        `Amenities for venue ID ${venueId} not found`,
      );
    }

    return amenity;
  }

  async updateAmenities(id: string, body: UpdateAmenitiesDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }

    const updateData: any = { ...body };
    if (body.venueId) {
      if (!Types.ObjectId.isValid(body.venueId)) {
        throw new BadRequestException('Invalid venueId format');
      }
      updateData.venueId = new Types.ObjectId(body.venueId);
    }

    const updated = await this.amenitiesRepo.findOneAndUpdate({
      filter: { _id: id },
      update: updateData,
    });

    if (!updated) {
      throw new NotFoundException(`Amenities record with ID ${id} not found`);
    }

    return updated;
  }

  async removeAmenities(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }

    const deleted = await this.amenitiesRepo.findOneAndDelete({
      filter: { _id: id },
    });

    if (!deleted) {
      throw new NotFoundException(`Amenities record with ID ${id} not found`);
    }

    return { message: 'Amenities record deleted successfully', id };
  }
}
