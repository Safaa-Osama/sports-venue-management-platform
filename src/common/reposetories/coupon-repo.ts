import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import BaseRepo from './base-repo';
import { Coupon, CouponDocument } from 'src/modules/coupon/entities/coupon.entity';

@Injectable()
export class CouponRepo extends BaseRepo<CouponDocument> {
  constructor(
    @InjectModel(Coupon.name) protected readonly couponModel: Model<CouponDocument>,
  ) {
    super(couponModel);
  }
}
