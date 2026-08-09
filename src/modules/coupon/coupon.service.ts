import {
  BadRequestException, Injectable, NotFoundException
} from '@nestjs/common';
import { CouponEnum } from 'src/common/enums/couponEnum';
import { CouponRepo } from 'src/common/reposetories/coupon-repo';
import { AdminUserDocument } from '../user/entities/admin-user.entity';
import { CreateCouponDto, UpdateCouponDto, ValidateCouponDto } from './dto/coupon.dto';
import { UserRepo } from 'src/common/reposetories/user-repo';


@Injectable()
export class CouponService {
  constructor(
    private readonly couponRepo: CouponRepo,
    private readonly userRepo: UserRepo
  ) { }

  async createCoupon(body: CreateCouponDto, user: AdminUserDocument) {
    const { code, discount, startDate, endDate, maxUses, usesCount, isActive } = body

    if (await this.couponRepo.findOne({ filter: { code: code.toLowerCase() } })) {
      throw new BadRequestException('Coupon already exists')
    }

    const coupon = await this.couponRepo.create({
      createdBy: user._id,
      code: code.toUpperCase(),
      discount,
      startDate,
      endDate,
      maxUses,
      usesCount,
      isActive,
    })

    return coupon

  }

  async updateCoupon(id: string, body: UpdateCouponDto, user: AdminUserDocument) {
    const { code, discount, startDate, endDate, maxUses, usesCount, isActive } = body

    const coupon = await this.couponRepo.findOne({ filter: { _id: id, createdBy: user._id } })
    if (!coupon) {
      throw new BadRequestException('Coupon not found')
    }

    if (code) {
      coupon.code = code.toLowerCase()
    }
    if (discount) {
      coupon.discount = discount
    }
    if (startDate) {
      coupon.startDate = startDate
    }
    if (endDate) {
      coupon.endDate = endDate
    }
    if (maxUses) {
      coupon.maxUses = maxUses
    }
    if (usesCount) {
      coupon.usesCount = usesCount
    }
    if (isActive) {
      coupon.isActive = isActive
    }

    await coupon.save()
    return coupon
  }


  async deleteCoupon(id: string, user: AdminUserDocument) {
    const coupon = await this.couponRepo.findOne({ filter: { _id: id, createdBy: user._id } })
    if (!coupon) {
      throw new BadRequestException('Coupon not found')
    }
    await this.couponRepo.findOneAndDelete({
      filter: { _id: id, createdBy: user._id }
    })
    return { message: "Coupon deleted successfully" }
  }

  async validateCoupon(body: ValidateCouponDto, user: AdminUserDocument) {
    const { code, bookingAmount } = body

    const coupon = await this.couponRepo.findOne({ filter: { code: code.toUpperCase(), createdBy: user._id } });
    if (!coupon) {
      throw new NotFoundException('Coupon code not found');
    }

    if (!coupon.isActive) {
      throw new BadRequestException('Coupon is inactive');
    }

    if (coupon.usesCount >= coupon.maxUses) {
      throw new BadRequestException('Coupon maximum usage limit has been reached');
    }

    const now = new Date();
    if (now < new Date(coupon.startDate)) {
      throw new BadRequestException('Coupon is not active yet');
    }

    if (now > new Date(coupon.endDate)) {
      throw new BadRequestException('Coupon has expired');
    }

    let discountAmount = 0;
    if (coupon.discountType === CouponEnum.percentage) {
      discountAmount = (bookingAmount * coupon.discount) / 100;
    } else if (coupon.discountType === CouponEnum.fixed) {
      discountAmount = coupon.discount;
    }

    discountAmount = Math.min(discountAmount, bookingAmount);
      const finalPrice = Math.max(0, bookingAmount - discountAmount);

    return {
      isValid: true,
      code: coupon.code,
      discount: coupon.discount,
      discountType: coupon.discountType,
      discountAmount: Number(discountAmount.toFixed(2)),
      finalPrice: Number(finalPrice.toFixed(2)),
    };
  }
}
