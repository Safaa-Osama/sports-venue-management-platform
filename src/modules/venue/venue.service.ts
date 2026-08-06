import { BadRequestException, Injectable } from '@nestjs/common';
import { VenueRepo } from 'src/common/reposetories/venue-repo';
import { CreateVenueDto } from './dto/venue.dto';
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
}
