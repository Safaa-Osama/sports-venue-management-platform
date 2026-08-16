// import { BadRequestException, Injectable, NotFoundException} from '@nestjs/common';
// import { Types } from 'mongoose';
// import {AdvertisementPositionEnum,AdvertisementStatusEnum,} from 'src/common/enums/advertisementEnum';
// import { AdvertisementRepo } from 'src/common/reposetories/advertisement-repo';
// import { RedisService } from 'src/common/services/redis/redis.service';
// import { S3Service } from 'src/common/services/s3Service/s3.service';
// import { 
//   BulkReorderAdvertisementDto, CreateAdvertisementDto, GetDashboardAdvertisementsDto, QueryAdvertisementDto, ScheduleAdvertisementDto, UpdateAdvertisementDto,
// } from './dto/advertisement.dto';
// import { AdvertisementDocument } from './entities/advertisement.entity';
// import { AdminUserDocument } from '../user/entities/admin-user.entity';

// @Injectable()
// export class AdvertisementService {
//   private readonly CACHE_PREFIX = 'ad:dashboard:';
//   private readonly CACHE_TTL_SECONDS = 300; // 5 minutes

//   constructor(
//     private readonly advertisementRepo: AdvertisementRepo,
//     private readonly s3Service: S3Service,
//     private readonly redisService: RedisService,
//   ) {}

//   /**
//    * Helper to invalidate all dashboard advertisement caches.
//    */
//   public async invalidateDashboardCache(): Promise<void> {
//     try {
//       const keysToDelete = [
//         `${this.CACHE_PREFIX}all`,
//         ...Object.values(AdvertisementPositionEnum).map(
//           (pos) => `${this.CACHE_PREFIX}${pos}`,
//         ),
//       ];
//       await this.redisService.delKey(keysToDelete);
//     } catch {
//       // Invalidation errors should not block business operations
//     }
//   }

//   /**
//    * Helper to validate date boundaries and compute proper lifecycle status.
//    */
//   private computeLifecycleStatus(
//     startDate?: Date,
//     endDate?: Date,
//     explicitStatus?: AdvertisementStatusEnum,
//   ): AdvertisementStatusEnum {
//     const now = new Date();

//     if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
//       throw new BadRequestException('endDate cannot be before startDate');
//     }

//     if (endDate && new Date(endDate) < now) {
//       return AdvertisementStatusEnum.expired;
//     }

//     if (startDate && new Date(startDate) > now) {
//       return AdvertisementStatusEnum.scheduled;
//     }

//     return explicitStatus || AdvertisementStatusEnum.active;
//   }

//   /**
//    * Admin: Creates a new advertisement with image upload to S3.
//    */
//   async create(body: CreateAdvertisementDto,user: AdminUserDocument,imageFile?: Express.Multer.File ){
//     if (!imageFile) {
//       throw new BadRequestException('Advertisement banner image is required');
//     }

//     const { startDate, endDate, status, ...restDto } = body;
//     const computedStatus = this.computeLifecycleStatus(startDate,endDate,status);
//     let uploadedImageKey: string | undefined;

//     try {
//       uploadedImageKey = await this.s3Service.uploadFile({
//         file: imageFile,
//         path: 'advertisements',
//       });

//       const adData: Partial<AdvertisementDocument> = {
//         ...restDto,
//         image: uploadedImageKey,
//         status: computedStatus,
//         startDate: startDate ? new Date(startDate) : undefined,
//         endDate: endDate ? new Date(endDate) : undefined,
//         createdBy: user?._id ? new Types.ObjectId(user._id) : undefined,
//       };

//       const createdAd = await this.advertisementRepo.create(adData);
//       await this.invalidateDashboardCache();

//       return createdAd;
//     } catch (error) {
//       // Rollback uploaded S3 image on database failure
//       if (uploadedImageKey) {
//         await this.s3Service.deleteFile(uploadedImageKey).catch(() => {});
//       }
//       throw error;
//     }
//   }

//   /**
//    * Admin: Updates an advertisement with optional new banner image replacement.
//    */
//   async update(
//     id: string,
//     dto: UpdateAdvertisementDto,
//     user: any,
//     imageFile?: Express.Multer.File,
//   ): Promise<AdvertisementDocument> {
//     if (!Types.ObjectId.isValid(id)) {
//       throw new BadRequestException('Invalid advertisement ID format');
//     }

//     const ad = await this.advertisementRepo.findById(id);
//     if (!ad) {
//       throw new NotFoundException('Advertisement not found');
//     }

//     const mergedStartDate =
//       dto.startDate !== undefined ? dto.startDate : ad.startDate;
//     const mergedEndDate = dto.endDate !== undefined ? dto.endDate : ad.endDate;

//     if (
//       mergedStartDate &&
//       mergedEndDate &&
//       new Date(mergedEndDate) < new Date(mergedStartDate)
//     ) {
//       throw new BadRequestException('endDate cannot be before startDate');
//     }

//     let computedStatus = dto.status;
//     if (
//       dto.startDate !== undefined ||
//       dto.endDate !== undefined ||
//       dto.status
//     ) {
//       computedStatus = this.computeLifecycleStatus(
//         mergedStartDate,
//         mergedEndDate,
//         dto.status || ad.status,
//       );
//     }

//     const updatePayload: Record<string, any> = {
//       ...dto,
//       ...(computedStatus ? { status: computedStatus } : {}),
//     };

//     let newlyUploadedKey: string | undefined;

//     if (imageFile) {
//       newlyUploadedKey = await this.s3Service.uploadFile({
//         file: imageFile,
//         path: 'advertisements',
//       });
//       updatePayload.image = newlyUploadedKey;
//     }

//     try {
//       const updatedAd = await this.advertisementRepo.findByIdAndUpdate({
//         id,
//         update: { $set: updatePayload },
//       });

//       if (!updatedAd) {
//         throw new NotFoundException('Advertisement not found');
//       }

//       // Cleanup old S3 image after successful update
//       if (imageFile && ad.image && newlyUploadedKey) {
//         await this.s3Service.deleteFile(ad.image).catch(() => {});
//       }

//       await this.invalidateDashboardCache();
//       return updatedAd;
//     } catch (error) {
//       // Rollback newly uploaded file on failure
//       if (newlyUploadedKey) {
//         await this.s3Service.deleteFile(newlyUploadedKey).catch(() => {});
//       }
//       throw error;
//     }
//   }

//   /**
//    * Admin: Deletes an advertisement and purges associated S3 asset.
//    */
//   async delete(id: string, user: any) {
//     if (!Types.ObjectId.isValid(id)) {
//       throw new BadRequestException('Invalid advertisement ID format');
//     }

//     const ad = await this.advertisementRepo.findById(id);
//     if (!ad) {
//       throw new NotFoundException('Advertisement not found');
//     }

//     await this.advertisementRepo.findByIdAndDelete(id);

//     if (ad.image) {
//       await this.s3Service.deleteFile(ad.image).catch(() => {});
//     }

//     await this.invalidateDashboardCache();

//     return {
//       message: 'Advertisement deleted successfully',
//       id,
//     };
//   }

//   /**
//    * Admin: Gets a single advertisement with full analytics and createdBy details.
//    */
//   async findById(id: string): Promise<AdvertisementDocument> {
//     if (!Types.ObjectId.isValid(id)) {
//       throw new BadRequestException('Invalid advertisement ID format');
//     }

//     const ad = await this.advertisementRepo.findOne({
//       filter: { _id: new Types.ObjectId(id) },
//       options: {
//         populate: [{ path: 'createdBy', select: 'userName email role' }],
//       },
//     });

//     if (!ad) {
//       throw new NotFoundException('Advertisement not found');
//     }

//     return ad;
//   }

//   /**
//    * Admin: Gets paginated advertisements with filters and search.
//    */
//   async findAllAdmin(query: QueryAdvertisementDto) {
//     const {
//       page = 1,
//       limit = 10,
//       status,
//       position,
//       search,
//       sortBy = 'createdAt',
//       sortOrder = 'desc',
//     } = query;

//     const filter: any = {};

//     if (status) {
//       filter.status = status;
//     }

//     if (position) {
//       filter.position = position;
//     }

//     if (search && search.trim()) {
//       const sanitizedSearch = search.trim();
//       filter.$or = [
//         { title: { $regex: sanitizedSearch, $options: 'i' } },
//         { description: { $regex: sanitizedSearch, $options: 'i' } },
//       ];
//     }

//     const sortDirection = sortOrder === 'asc' || sortOrder === '1' ? 1 : -1;
//     const sort: any = { [sortBy]: sortDirection };

//     if (sortBy !== 'createdAt') {
//       sort.createdAt = -1;
//     }

//     const result = await this.advertisementRepo.paginate({
//       page,
//       limit,
//       search: filter,
//       sort,
//       populate: [{ path: 'createdBy', select: 'userName email role' }],
//     });

//     return {
//       message: 'Advertisements retrieved successfully',
//       ...result,
//     };
//   }

//   /**
//    * Admin: Activates or deactivates an advertisement status.
//    */
//   async updateStatus(
//     id: string,
//     status: AdvertisementStatusEnum,
//     user: any,
//   ): Promise<AdvertisementDocument> {
//     if (!Types.ObjectId.isValid(id)) {
//       throw new BadRequestException('Invalid advertisement ID format');
//     }

//     const updatedAd = await this.advertisementRepo.findByIdAndUpdate({
//       id,
//       update: { $set: { status } },
//     });

//     if (!updatedAd) {
//       throw new NotFoundException('Advertisement not found');
//     }

//     await this.invalidateDashboardCache();
//     return updatedAd;
//   }

//   /**
//    * Admin: Schedules an advertisement with start and end dates.
//    */
//   async schedule(
//     id: string,
//     dto: ScheduleAdvertisementDto,
//     user: any,
//   ): Promise<AdvertisementDocument> {
//     if (!Types.ObjectId.isValid(id)) {
//       throw new BadRequestException('Invalid advertisement ID format');
//     }

//     const { startDate, endDate } = dto;
//     if (endDate && new Date(endDate) < new Date(startDate)) {
//       throw new BadRequestException('endDate cannot be before startDate');
//     }

//     const computedStatus = this.computeLifecycleStatus(
//       startDate,
//       endDate,
//       AdvertisementStatusEnum.active,
//     );

//     const updatedAd = await this.advertisementRepo.findByIdAndUpdate({
//       id,
//       update: {
//         $set: {
//           startDate: new Date(startDate),
//           endDate: endDate ? new Date(endDate) : null,
//           status: computedStatus,
//         },
//       },
//     });

//     if (!updatedAd) {
//       throw new NotFoundException('Advertisement not found');
//     }

//     await this.invalidateDashboardCache();
//     return updatedAd;
//   }

//   /**
//    * Admin: Updates display priority for single advertisement.
//    */
//   async updatePriority(
//     id: string,
//     priority: number,
//     user: any,
//   ): Promise<AdvertisementDocument> {
//     if (!Types.ObjectId.isValid(id)) {
//       throw new BadRequestException('Invalid advertisement ID format');
//     }

//     const updatedAd = await this.advertisementRepo.findByIdAndUpdate({
//       id,
//       update: { $set: { priority } },
//     });

//     if (!updatedAd) {
//       throw new NotFoundException('Advertisement not found');
//     }

//     await this.invalidateDashboardCache();
//     return updatedAd;
//   }

//   /**
//    * Admin: Bulk reorders multiple advertisements.
//    */
//   async bulkReorder(dto: BulkReorderAdvertisementDto, user: any) {
//     for (const item of dto.items) {
//       if (!Types.ObjectId.isValid(item.id)) {
//         throw new BadRequestException(`Invalid ID in items list: ${item.id}`);
//       }
//     }

//     await this.advertisementRepo.bulkUpdatePriorities(dto.items);
//     await this.invalidateDashboardCache();

//     return {
//       message: 'Advertisements reordered successfully',
//       count: dto.items.length,
//     };
//   }

//   /**
//    * Public/Dashboard: Retrieves eligible advertisements with Redis caching and secure field projection.
//    */
//   async getDashboardAdvertisements(query: GetDashboardAdvertisementsDto) {
//     const cacheKey = `${this.CACHE_PREFIX}${query.position || 'all'}`;

//     try {
//       const cached = await this.redisService.getValue(cacheKey);
//       if (cached) {
//         return {
//           fromCache: true,
//           data: cached,
//         };
//       }
//     } catch {
//       // Fallback on Redis failure
//     }

//     const advertisements =
//       await this.advertisementRepo.findEligibleForDashboard(query.position);

//     try {
//       await this.redisService.setValue({
//         key: cacheKey,
//         value: advertisements,
//         ttl: this.CACHE_TTL_SECONDS,
//       });
//     } catch {
//       // Ignore cache write failure
//     }

//     return {
//       fromCache: false,
//       data: advertisements,
//     };
//   }

//   /**
//    * Public Tracking: Atomically records an impression counter increment.
//    */
//   async recordImpression(id: string) {
//     if (!Types.ObjectId.isValid(id)) {
//       throw new BadRequestException('Invalid advertisement ID format');
//     }

//     const ad = await this.advertisementRepo.incrementImpression(id);
//     if (!ad) {
//       throw new NotFoundException('Advertisement not found');
//     }

//     return {
//       message: 'Impression recorded successfully',
//     };
//   }

//   /**
//    * Public Tracking: Atomically records a click counter increment.
//    */
//   async recordClick(id: string) {
//     if (!Types.ObjectId.isValid(id)) {
//       throw new BadRequestException('Invalid advertisement ID format');
//     }

//     const ad = await this.advertisementRepo.incrementClick(id);
//     if (!ad) {
//       throw new NotFoundException('Advertisement not found');
//     }

//     return {
//       message: 'Click recorded successfully',
//       linkUrl: ad.linkUrl || null,
//     };
//   }
// }
