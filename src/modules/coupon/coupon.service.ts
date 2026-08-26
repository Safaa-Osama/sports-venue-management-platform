import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CouponEnum } from 'src/common/enums/couponEnum';
import { CouponRepo } from 'src/common/repositories/coupon-repo';
import { AdminUserDocument } from '../user/entities/admin-user.entity';
import {
  CreateCouponDto,
  UpdateCouponDto,
  ValidateCouponDto,
} from './dto/coupon.dto';
import { UserRepo } from 'src/common/repositories/user-repo';
import { calculateCouponDiscount } from './utils/coupon-calculator.utils';

@Injectable()
export class CouponService {
  constructor(
    private readonly couponRepo: CouponRepo,
    private readonly userRepo: UserRepo,
  ) { }

  async getAllCoupons(query?: { search?: string; status?: string }) {
    const filter: Record<string, any> = {};

    if (query?.search) {
      filter.code = { $regex: query.search.trim(), $options: 'i' };
    }

    if (query?.status === 'active') {
      filter.isActive = true;
      filter.endDate = { $gte: new Date() };
    } else if (query?.status === 'expired') {
      filter.endDate = { $lt: new Date() };
    } else if (query?.status === 'inactive') {
      filter.isActive = false;
    }

    const coupons = await this.couponRepo.find({
      filter,
      options: { sort: { createdAt: -1 } },
    });

    return coupons;
  }

  async getCouponById(id: string) {
    const coupon = await this.couponRepo.findById(id);
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    return coupon;
  }

  async createCoupon(body: CreateCouponDto, user: AdminUserDocument) {
    const {
      code,
      discountType,
      discount,
      startDate,
      endDate,
      maxUses,
      usesCount,
      isActive,
    } = body;

    const normalizedCode = code.trim().toUpperCase();
    if (
      await this.couponRepo.findOne({ filter: { code: normalizedCode } })
    ) {
      throw new BadRequestException('Coupon already exists');
    }

    const coupon = await this.couponRepo.create({
      createdBy: user._id,
      code: normalizedCode,
      discountType,
      discount,
      startDate,
      endDate,
      maxUses,
      usesCount,
      isActive,
    });

    return coupon;
  }

  async updateCoupon(
    id: string,
    body: UpdateCouponDto,
    user: AdminUserDocument,
  ) {
    const {
      code,
      discountType,
      discount,
      startDate,
      endDate,
      maxUses,
      usesCount,
      isActive,
    } = body;

    const coupon = await this.couponRepo.findOne({
      filter: { _id: id, createdBy: user._id },
    });
    if (!coupon) {
      throw new BadRequestException('Coupon not found');
    }

    if (code) {
      coupon.code = code.trim().toUpperCase();
    }
    if (discountType) {
      coupon.discountType = discountType;
    }
    if (discount) {
      coupon.discount = discount;
    }
    if (startDate) {
      coupon.startDate = startDate;
    }
    if (endDate) {
      coupon.endDate = endDate;
    }
    if (maxUses) {
      coupon.maxUses = maxUses;
    }
    if (usesCount) {
      coupon.usesCount = usesCount;
    }
    if (isActive !== undefined) {
      coupon.isActive = isActive;
    }

    await coupon.save();
    return coupon;
  }

  async deleteCoupon(id: string, user: AdminUserDocument) {
    const coupon = await this.couponRepo.findOne({
      filter: { _id: id, createdBy: user._id },
    });
    if (!coupon) {
      throw new BadRequestException('Coupon not found');
    }
    await this.couponRepo.findOneAndDelete({
      filter: { _id: id, createdBy: user._id },
    });
    return { message: 'Coupon deleted successfully' };
  }

  async validateCoupon(body: ValidateCouponDto) {
    const { code, bookingAmount } = body;
    const normalizedCode = code?.trim().toUpperCase();

    const coupon = await this.couponRepo.findOne({
      filter: { code: normalizedCode },
    });
    if (!coupon) {
      throw new NotFoundException('Coupon code not found');
    }

    if (!coupon.isActive) {
      throw new BadRequestException('Coupon is inactive');
    }

    if (coupon.usesCount >= coupon.maxUses) {
      throw new BadRequestException(
        'Coupon maximum usage limit has been reached',
      );
    }

    const now = new Date();
    if (now < new Date(coupon.startDate)) {
      throw new BadRequestException('Coupon is not active yet');
    }

    if (now > new Date(coupon.endDate)) {
      throw new BadRequestException('Coupon has expired');
    }

    const { discountAmount, finalPrice } = calculateCouponDiscount(
      coupon.discountType,
      coupon.discount,
      bookingAmount,
    );

    return {
      isValid: true,
      code: coupon.code,
      discount: coupon.discount,
      discountType: coupon.discountType,
      discountAmount,
      finalPrice,
    };
  }
}
