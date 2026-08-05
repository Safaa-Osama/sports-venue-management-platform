import { BadRequestException, Injectable } from '@nestjs/common';
import { VenueRepo } from 'src/common/reposetories/venue-repo';
import { CreateVenueDto } from './dto/venue.dto';
import { S3Service } from 'src/common/services/s3Service/s3.service';
import { VenueAmenities } from './entities/venue.entity';
import { AdminUserDocument } from '../user/entities/admin-user.entity';

@Injectable()
export class VenueService {

  constructor(
    private readonly venueRepo: VenueRepo,
    private s3service: S3Service
  ) { }

  async createVenue(body: CreateVenueDto, user: AdminUserDocument, images?: Express.Multer.File[]) {
    const { venueName, sportsType,
      address, locationAlt, locationLang,
      amenities,
      startWorkingHours, endWorkingHours,
      defaultHourPrice, customHourPrices,
      isActive
    } = body

    if (await this.venueRepo.findOne({ filter: { venueName } })) {
      throw new BadRequestException("Venue name already exists");
    }

    amenities.forEach(amenity => {
      if (!["Parking", "Cafeteria", "Shower", "ChangingRoom", "Toilets", "WiFi", "Lockers", "FloodLights", "DrinkingWater", "FirstAid", "PrayerArea", "EquipmentRental"].includes(amenity)) {
        throw new BadRequestException("Invalid amenity");
      }
    });

    let uploadedImages: string[] | undefined;
    if (images) {
      uploadedImages = await this.s3service.uploadFiles({
        files: images,
        path: `venue/galllery/${venueName}`,
      })
    }

    const venueAmenities: Partial<Record<keyof VenueAmenities, boolean>> = {};

    if (amenities?.length) {
      for (const amenity of amenities) {
        venueAmenities[amenity as keyof VenueAmenities] = true;
      }
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
      isActive,
      createdBy: user._id,
    });

    if (!venue) {
      if (uploadedImages) {
        await this.s3service.deleteManyFiles(uploadedImages)
      }
      throw new BadRequestException("Venue not created");
    }

    return venue;

  }


}
