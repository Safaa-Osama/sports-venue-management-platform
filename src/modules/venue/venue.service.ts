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
import { PushNotificationService } from '../push-notification/push-notification.service';

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
    private readonly pushService: PushNotificationService,
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
      minimumDepositAmount,
      existingImages,
      keepImages,
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
          (allowed) =>
            allowed.toLowerCase() === trimmed.toLowerCase() ||
            allowed.toLowerCase() + 's' === trimmed.toLowerCase() ||
            (allowed.endsWith('s') &&
              allowed.slice(0, -1).toLowerCase() === trimmed.toLowerCase()),
        );

        if (!matchedAmenity) {
          throw new BadRequestException(
            `Invalid amenity: ${amenity}. Allowed amenities are: ${ALLOWED_AMENITIES.join(', ')}`,
          );
        }

        venueAmenities[matchedAmenity as keyof VenueAmenities] = true;
      }
    }

    const initialImages: string[] = [];
    if (existingImages && Array.isArray(existingImages)) {
      initialImages.push(...existingImages);
    } else if (keepImages && Array.isArray(keepImages)) {
      initialImages.push(...keepImages);
    }

    let uploadedImages: string[] = [];
    if (images && images.length > 0) {
      const sanitizedFolder = venueName.replace(/[^a-zA-Z0-9_-]/g, '_');
      uploadedImages = await this.s3service.uploadFiles({
        files: images,
        path: `venue/gallery/${sanitizedFolder}`,
      });
    }

    const allImages = [...initialImages, ...uploadedImages];

    const venue = await this.venueRepo.create({
      venueName,
      sportsType,
      address,
      locationAlt,
      locationLang,
      images: allImages,
      amenities: venueAmenities as VenueAmenities,
      startWorkingHours,
      endWorkingHours,
      WorkingHours: endWorkingHours - startWorkingHours,
      defaultHourPrice,
      customHourPrices,
      minimumDepositAmount: minimumDepositAmount || 0,
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
      minimumDepositAmount,
      isActive,
      existingImages,
      keepImages,
      removedImages,
      deleteImages,
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
    if (minimumDepositAmount !== undefined)
      updateData.minimumDepositAmount = minimumDepositAmount;
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
            (allowed) =>
              allowed.toLowerCase() === trimmed.toLowerCase() ||
              allowed.toLowerCase() + 's' === trimmed.toLowerCase() ||
              (allowed.endsWith('s') &&
                allowed.slice(0, -1).toLowerCase() === trimmed.toLowerCase()),
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

    // Process Image Removal & Retention
    let currentStoredKeys = [...(venue.images || [])];

    const toDeleteInputs = [...(removedImages || []), ...(deleteImages || [])];
    if (toDeleteInputs.length > 0) {
      const keysToDelete: string[] = [];
      for (const input of toDeleteInputs) {
        const matched = this.matchStoredImageKey(input, currentStoredKeys);
        if (matched && !keysToDelete.includes(matched)) {
          keysToDelete.push(matched);
        }
      }
      if (keysToDelete.length > 0) {
        await this.s3service.deleteManyFiles(keysToDelete).catch(() => {});
        currentStoredKeys = currentStoredKeys.filter(
          (k) => !keysToDelete.includes(k),
        );
      }
    }

    const toKeepInputs = existingImages || keepImages;
    if (toKeepInputs !== undefined) {
      const keptKeys: string[] = [];
      for (const input of toKeepInputs) {
        const matched = this.matchStoredImageKey(input, currentStoredKeys);
        if (matched && !keptKeys.includes(matched)) {
          keptKeys.push(matched);
        }
      }
      currentStoredKeys = keptKeys;
    }

    let newlyUploadedImages: string[] = [];
    if (images && images.length > 0) {
      const targetName = venueName || venue.venueName;
      const sanitizedFolder = targetName.replace(/[^a-zA-Z0-9_-]/g, '_');
      newlyUploadedImages = await this.s3service.uploadFiles({
        files: images,
        path: `venue/gallery/${sanitizedFolder}`,
      });
    }

    if (
      existingImages !== undefined ||
      keepImages !== undefined ||
      removedImages !== undefined ||
      deleteImages !== undefined ||
      (images && images.length > 0)
    ) {
      updateData.images = [...currentStoredKeys, ...newlyUploadedImages];
    }

    const updatedVenue = await this.venueRepo.findByIdAndUpdate({
      id,
      update: updateData,
    });

    if (venue.isActive === false && updateData.isActive === true) {
      this.pushService.broadcastToAllCustomers('PITCH_REOPENED', {
        venueName: venue.venueName,
      }, {
        route: `/pitch/${id}`,
        venueId: id,
      }).catch(() => {});
    }

    const updatedVenueObj = updatedVenue?.toObject? updatedVenue.toObject(): updatedVenue;
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

  /**
   * Helper to match an input URL or key substring to an existing stored S3 key in the venue.
   */
  private matchStoredImageKey(
    inputStr: string,
    storedKeys: string[],
  ): string | null {
    if (!inputStr) return null;
    const cleanInput = inputStr.split('?')[0].trim();
    for (const key of storedKeys) {
      if (
        cleanInput === key ||
        cleanInput.endsWith(key) ||
        key.endsWith(cleanInput) ||
        inputStr.includes(key)
      ) {
        return key;
      }
    }
    return null;
  }

  async deleteVenueImage(
    id: string,
    imageKeyOrUrl: string,
    user: AdminUserDocument,
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

    const currentKeys = venue.images || [];
    const matchedKey = this.matchStoredImageKey(imageKeyOrUrl, currentKeys);

    if (!matchedKey) {
      throw new NotFoundException('Specified image not found in venue gallery');
    }

    await this.s3service.deleteFile(matchedKey).catch(() => {});
    const remainingKeys = currentKeys.filter((k) => k !== matchedKey);

    const updatedVenue = await this.venueRepo.findByIdAndUpdate({
      id,
      update: { images: remainingKeys, updatedBy: user._id },
    });

    const updatedVenueObj = updatedVenue?.toObject
      ? updatedVenue.toObject()
      : updatedVenue;

    return {
      message: 'Image deleted successfully',
      images: await this.s3service.getPreSignedUrls(
        updatedVenueObj?.images || [],
        { download: 'false', expiresIn: 60 * 60 * 24 },
      ),
    };
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
