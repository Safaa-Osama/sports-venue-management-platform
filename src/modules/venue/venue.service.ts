import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { VenueRepo } from 'src/common/reposetories/venue-repo';
import { CreateVenueDto, UpdateteVenueDto } from './dto/venue.dto';
import { S3Service } from 'src/common/services/s3Service/s3.service';
import { VenueAmenities } from './entities/venue.entity';
import { AdminUserDocument } from '../user/entities/admin-user.entity';

const ALLOWED_AMENITIES = [
  'Parking',
  'Cafeteria',
  'Shower',
  'ChangingRoom',
  'Toilets',
  'WiFi',
  'Lockers',
  'FloodLights',
  'DrinkingWater',
  'FirstAid',
  'PrayerArea',
  'EquipmentRental',
];

@Injectable()
export class VenueService {
  constructor(
    private readonly venueRepo: VenueRepo,
    private readonly s3service: S3Service,
  ) { }

  async createVenue(
    body: CreateVenueDto,
    user: AdminUserDocument,
    images?: Express.Multer.File[],
  ) {
    const {
      venueName, sportsType,
      address, locationAlt, locationLang,
      amenities,
      startWorkingHours, endWorkingHours, defaultHourPrice, customHourPrices,
      isActive,
    } = body;

    const existingVenue = await this.venueRepo.findOne({ filter: { venueName } });
    if (existingVenue) {
      throw new BadRequestException('Venue name already exists');
    }

    const venueAmenities: Partial<Record<keyof VenueAmenities, boolean>> = {};

    if (amenities?.length) {
      for (const amenity of amenities) {
        const trimmed = amenity?.trim() || '';
        const matchedAmenity = ALLOWED_AMENITIES.find(
          (allowed) => allowed.toLowerCase() === trimmed.toLowerCase(),
        );

        if (!matchedAmenity) {
          throw new BadRequestException(
            `Invalid amenity: ${amenity}. Allowed amenities are: ${ALLOWED_AMENITIES.join(', ')}`,
          );
        }

        venueAmenities[matchedAmenity as keyof VenueAmenities] = true;
      }
    }

    let uploadedImages: string[] = [];
    if (images && images.length > 0) {
      const sanitizedFolder = venueName.replace(/[^a-zA-Z0-9_-]/g, '_');
      uploadedImages = await this.s3service.uploadFiles({
        files: images,
        path: `venue/gallery/${sanitizedFolder}`,
      });
    }

    const venue = await this.venueRepo.create({
      venueName,
      sportsType,
      address,
      locationAlt,
      locationLang,
      images: uploadedImages,
      amenities: venueAmenities as VenueAmenities,
      startWorkingHours,
      endWorkingHours,
      defaultHourPrice,
      customHourPrices,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: user._id,
    });

    if (!venue) {
      await this.s3service.deleteManyFiles(uploadedImages)
      throw new BadRequestException('Failed to create venue')
    }

    return venue;
  }

  async updateVenue(
    id: string,
    body: UpdateteVenueDto,
    user: AdminUserDocument,
    images?: Express.Multer.File[],
  ) {
    const venue = await this.venueRepo.findById(id);
    if (!venue) {
      throw new NotFoundException('Venue not found');
    }

    const {
      venueName,
      sportsType,
      address,
      locationAlt,
      locationLang,
      amenities,
      startWorkingHours,
      endWorkingHours,
      defaultHourPrice,
      customHourPrices,
      isActive,
    } = body;

    const updateData: Record<string, any> = { updatedBy: user._id };

    if (venueName && venueName !== venue.venueName) {
      const existingVenue = await this.venueRepo.findOne({ filter: { venueName } });
      if (existingVenue) {
        throw new ConflictException('Venue name already exists');
      }
      updateData.venueName = venueName;
    }

    if (address !== undefined) updateData.address = address;
    if (sportsType !== undefined) updateData.sportsType = sportsType;
    if (locationAlt !== undefined) updateData.locationAlt = locationAlt;
    if (locationLang !== undefined) updateData.locationLang = locationLang;
    if (defaultHourPrice !== undefined) updateData.defaultHourPrice = defaultHourPrice;
    if (customHourPrices !== undefined) updateData.customHourPrices = customHourPrices;
    if (isActive !== undefined) updateData.isActive = isActive;

    const newStart = startWorkingHours !== undefined ? startWorkingHours : venue.startWorkingHours;
    const newEnd = endWorkingHours !== undefined ? endWorkingHours : venue.endWorkingHours;

    if (startWorkingHours !== undefined) updateData.startWorkingHours = startWorkingHours;
    if (endWorkingHours !== undefined) updateData.endWorkingHours = endWorkingHours;
    if (startWorkingHours !== undefined || endWorkingHours !== undefined) {
      updateData.WorkingHours = newEnd - newStart;
    }

    if (amenities !== undefined) {
      const venueAmenities: Partial<Record<keyof VenueAmenities, boolean>> = {};
      if (amenities.length > 0) {
        for (const amenity of amenities) {
          const trimmed = amenity?.trim() || '';
          const matchedAmenity = ALLOWED_AMENITIES.find(
            (allowed) => allowed.toLowerCase() === trimmed.toLowerCase(),
          );

          if (!matchedAmenity) {
            throw new BadRequestException(
              `Invalid amenity: ${amenity}. Allowed amenities are: ${ALLOWED_AMENITIES.join(', ')}`,
            );
          }

          venueAmenities[matchedAmenity as keyof VenueAmenities] = true;
        }
      }
      updateData.amenities = venueAmenities;
    }

    if (images && images.length > 0) {
      const targetName = venueName || venue.venueName;
      const sanitizedFolder = targetName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const uploadedImages = await this.s3service.uploadFiles({
        files: images,
        path: `venue/gallery/${sanitizedFolder}`,
      });
      updateData.images = [...(venue.images || []), ...uploadedImages];
    }

    const updatedVenue = await this.venueRepo.findByIdAndUpdate({
      id,
      update: updateData,
    });

    return updatedVenue;
  }

  async deleteVenue(id: string, user: AdminUserDocument) {
    const venue = await this.venueRepo.findById(id);
    if (!venue) {
      throw new NotFoundException('Venue not found');
    }
    await this.venueRepo.findOneAndDelete({ filter: { id, deletedBy: user._id },
      options: { deletedAt: new Date(), isDeleted: true } });

    await this.s3service.deleteManyFiles(venue.images);
    return { message: 'Venue deleted successfully' };
  }

}