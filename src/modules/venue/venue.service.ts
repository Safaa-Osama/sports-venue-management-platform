import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { VenueRepo } from 'src/common/repositories/venue-repo';
import {
  CreateVenueDto,
  GetVenuesQueryDto,
  UpdateVenueDto,
} from './dto/venue.dto';
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

  async getAllVenues(query?: GetVenuesQueryDto) {
    const filter: Record<string, any> = {
      isActive: true,
      isDeleted: { $ne: true },
    };

    if (query?.sportsType?.trim()) {
      filter.sportsType = {
        $regex: new RegExp(`^${query.sportsType.trim()}$`, 'i'),
      };
    }

    const venues = await this.venueRepo.find({
      filter,
      projection: {
        venueName: 1,
        address: 1,
        sportsType: 1,
        amenities: 1,
        defaultHourPrice: 1,
        images: 1,
      },
    });

    return Promise.all(
      venues.map(async (venue) => {
        const venueObj = venue.toObject ? venue.toObject() : venue;
        return {
          ...venueObj,
          images: await this.s3service.getPreSignedUrls(
            venueObj.images || [],
            { download: 'false', expiresIn: 60 * 60 * 24 },
          ),
        };
      }),
    );
  }

  async getVenueById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid venue ID format');
    }

    const venue = await this.venueRepo.findOne({
      filter: {
        _id: id,
        isDeleted: { $ne: true },
      },
    });

    if (!venue) {
      throw new NotFoundException('Venue not found');
    }

    const venueObj = venue.toObject ? venue.toObject() : venue;
    return {
      ...venueObj,
      images: await this.s3service.getPreSignedUrls(venueObj.images || [], {
        download: 'false',
        expiresIn: 60 * 60 * 24,
      }),
    };
  }



  async createVenue(
    body: CreateVenueDto,
    user: AdminUserDocument,
    images?: Express.Multer.File[],
  ) {
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

    const existingVenue = await this.venueRepo.findOne({
      filter: { venueName, isDeleted: { $ne: true } },
    });
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
      WorkingHours: endWorkingHours - startWorkingHours,
      defaultHourPrice,
      customHourPrices,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: user._id,
      isDeleted: false,
    });

    if (!venue) {
      await this.s3service.deleteManyFiles(uploadedImages);
      throw new BadRequestException('Failed to create venue');
    }

    const venueObj = venue.toObject ? venue.toObject() : venue;
    return {
      ...venueObj,
      images: await this.s3service.getPreSignedUrls(venueObj.images || [], {
        download: 'false',
        expiresIn: 60 * 60 * 24,
      }),
    };
  }

  async updateVenue(
    id: string,
    body: UpdateVenueDto,
    user: AdminUserDocument,
    images?: Express.Multer.File[],
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid venue ID format');
    }

    const venue = await this.venueRepo.findOne({
      filter: { _id: id, isDeleted: { $ne: true } },
    });
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
      const existingVenue = await this.venueRepo.findOne({
        filter: {
          venueName,
          _id: { $ne: id },
          isDeleted: { $ne: true },
        },
      });
      if (existingVenue) {
        throw new ConflictException('Venue name already exists');
      }
      updateData.venueName = venueName;
    }

    if (address !== undefined) updateData.address = address;
    if (sportsType !== undefined) updateData.sportsType = sportsType;
    if (locationAlt !== undefined) updateData.locationAlt = locationAlt;
    if (locationLang !== undefined) updateData.locationLang = locationLang;
    if (defaultHourPrice !== undefined)
      updateData.defaultHourPrice = defaultHourPrice;
    if (customHourPrices !== undefined)
      updateData.customHourPrices = customHourPrices;
    if (isActive !== undefined) updateData.isActive = isActive;

    const newStart =
      startWorkingHours !== undefined
        ? startWorkingHours
        : venue.startWorkingHours;
    const newEnd =
      endWorkingHours !== undefined ? endWorkingHours : venue.endWorkingHours;

    if (startWorkingHours !== undefined)
      updateData.startWorkingHours = startWorkingHours;
    if (endWorkingHours !== undefined)
      updateData.endWorkingHours = endWorkingHours;
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

    const updatedVenueObj = updatedVenue?.toObject
      ? updatedVenue.toObject()
      : updatedVenue;
    return updatedVenueObj
      ? {
        ...updatedVenueObj,
        images: await this.s3service.getPreSignedUrls(
          updatedVenueObj.images || [],
          { download: 'false', expiresIn: 60 * 60 * 24 },
        ),
      }
      : null;
  }

  async deleteVenue(id: string, user: AdminUserDocument) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid venue ID format');
    }

    const venue = await this.venueRepo.findOne({
      filter: { _id: id, isDeleted: { $ne: true } },
    });
    if (!venue) {
      throw new NotFoundException('Venue not found');
    }

    await this.venueRepo.findByIdAndUpdate({
      id,
      update: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: user._id,
        isActive: false,
      },
    });

    return { message: 'Venue deleted successfully' };
  }
}
