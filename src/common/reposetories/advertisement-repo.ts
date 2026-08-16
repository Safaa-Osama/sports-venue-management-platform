// import { Injectable } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model, Types } from 'mongoose';
// import BaseRepo from './base-repo';
// // import {
// //   Advertisement,
// //   AdvertisementDocument,
// // } from 'src/modules/advertisement/entities/advertisement.entity';
// import {
//   AdvertisementPositionEnum,
//   AdvertisementStatusEnum,
// } from 'src/common/enums/advertisementEnum';

// @Injectable()
// export class AdvertisementRepo extends BaseRepo<AdvertisementDocument> {
//   constructor(
//     @InjectModel(Advertisement.name)
//     protected readonly advertisementModel: Model<AdvertisementDocument>,
//   ) {
//     super(advertisementModel);
//   }

//   /**
//    * Atomically increments the impression count by 1.
//    */
//   async incrementImpression(
//     id: string | Types.ObjectId,
//   ): Promise<AdvertisementDocument | null> {
//     return this.advertisementModel.findByIdAndUpdate(
//       id,
//       { $inc: { impressionCount: 1 } },
//       { new: true, select: '_id status linkUrl' },
//     );
//   }

//   /**
//    * Atomically increments the click count by 1.
//    */
//   async incrementClick(
//     id: string | Types.ObjectId,
//   ): Promise<AdvertisementDocument | null> {
//     return this.advertisementModel.findByIdAndUpdate(
//       id,
//       { $inc: { clickCount: 1 } },
//       { new: true, select: '_id status linkUrl' },
//     );
//   }

//   /**
//    * Queries active & eligible advertisements for the public dashboard.
//    * Projections are strictly limited to public-safe fields.
//    */
//   async findEligibleForDashboard(
//     position?: AdvertisementPositionEnum,
//   ): Promise<Partial<AdvertisementDocument>[]> {
//     const now = new Date();

//     const filter: any = {
//       status: AdvertisementStatusEnum.active,
//       $and: [
//         {
//           $or: [
//             { startDate: { $exists: false } },
//             { startDate: null },
//             { startDate: { $lte: now } },
//           ],
//         },
//         {
//           $or: [
//             { endDate: { $exists: false } },
//             { endDate: null },
//             { endDate: { $gte: now } },
//           ],
//         },
//       ],
//     };

//     if (position) {
//       filter.position = position;
//     }

//     return this.advertisementModel
//       .find(filter)
//       .select('title description image linkUrl position priority createdAt')
//       .sort({ priority: -1, createdAt: -1 })
//       .lean()
//       .exec();
//   }

//   /**
//    * Bulk updates priorities for multiple advertisements in a single operation.
//    */
//   async bulkUpdatePriorities(
//     items: { id: string | Types.ObjectId; priority: number }[],
//   ) {
//     const operations = items.map((item) => ({
//       updateOne: {
//         filter: { _id: new Types.ObjectId(item.id) },
//         update: { $set: { priority: item.priority } },
//       },
//     }));

//     return this.advertisementModel.bulkWrite(operations);
//   }
// }
