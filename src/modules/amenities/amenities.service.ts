import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import { Types } from 'mongoose';
import { amenitiesRepo } from 'src/common/repositories/amenities-repo';
import { AdminUserDocument } from '../user/entities/admin-user.entity';
import { CreateAmenitiesDto, QueryAmenitiesDto,UpdateAmenitiesDto,} from './dto/amenities.dto';


@Injectable()
export class AmenitiesService {
  constructor(private readonly amenitiesRepo: amenitiesRepo) {}

  async create(body: CreateAmenitiesDto, user?: AdminUserDocument) {
    const trimmedName = body.amenityName.trim();

    if (!trimmedName) {
      throw new BadRequestException('Amenity name cannot be empty');
    }

    const existing = await this.amenitiesRepo.findOne({
      filter: {
        amenityName: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
        isDeleted: { $ne: true },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Amenity with name "${trimmedName}" already exists.`,
      );
    }

    const amenity = await this.amenitiesRepo.create({
      amenityName: trimmedName,
      iconUrl: body.iconUrl,
      isActive: body.isActive !== undefined ? body.isActive : true,
      isDeleted: false,
      createdBy: user?._id ? new Types.ObjectId(user._id) : undefined,
    });

    if (!amenity) {
      throw new BadRequestException('Failed to create amenity record');
    }

    return amenity;
  }

  async findAll(query?: QueryAmenitiesDto) {
    const filter: any = { isDeleted: { $ne: true } };

    if (query?.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    if (query?.search?.trim()) {
      filter.amenityName = {
        $regex: query.search.trim(),
        $options: 'i',
      };
    }

    return this.amenitiesRepo.find({ filter });
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }

    const amenity = await this.amenitiesRepo.findOne({
      filter: {
        _id: new Types.ObjectId(id),
        isDeleted: { $ne: true },
      },
    });

    if (!amenity) {
      throw new NotFoundException(`Amenity with ID ${id} not found`);
    }

    return amenity;
  }

  async updateAmenities( id: string, body: UpdateAmenitiesDto,user?: AdminUserDocument){
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }

    const existing = await this.amenitiesRepo.findOne({
      filter: {
        _id: new Types.ObjectId(id),
        isDeleted: { $ne: true },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Amenity with ID ${id} not found`);
    }

    const updateData: any = { ...body };

    if (body.amenityName) {
      const trimmedName = body.amenityName.trim();
      if (!trimmedName) {
        throw new BadRequestException('Amenity name cannot be empty');
      }

      const duplicate = await this.amenitiesRepo.findOne({
        filter: {
          _id: { $ne: new Types.ObjectId(id) },
          amenityName: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
          isDeleted: { $ne: true },
        },
      });

      if (duplicate) {
        throw new ConflictException(
          `Amenity with name "${trimmedName}" already exists.`,
        );
      }

      updateData.amenityName = trimmedName;
    }

    if (user?._id) {
      updateData.updatedBy = new Types.ObjectId(user._id);
    }

    const updated = await this.amenitiesRepo.findOneAndUpdate({
      filter: { _id: new Types.ObjectId(id), isDeleted: { $ne: true } },
      update: updateData,
    });

    if (!updated) {
      throw new NotFoundException(`Amenity with ID ${id} not found`);
    }

    return updated;
  }

  async removeAmenities(id: string, user?: AdminUserDocument) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }

    const deleted = await this.amenitiesRepo.findOneAndUpdate({
      filter: { _id: new Types.ObjectId(id), isDeleted: { $ne: true } },
      update: {
        isDeleted: true,
        isActive: false,
        deletedAt: new Date(),
        deletedBy: user?._id ? new Types.ObjectId(user._id) : undefined,
      },
    });

    if (!deleted) {
      throw new NotFoundException(`Amenity with ID ${id} not found`);
    }

    return { message: 'Amenity deleted successfully', id };
  }
}
