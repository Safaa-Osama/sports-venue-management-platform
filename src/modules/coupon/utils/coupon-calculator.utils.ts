import { CouponEnum } from 'src/common/enums/couponEnum';

export interface CouponDiscountResult {
  discountAmount: number;
  finalPrice: number;
}

export function calculateCouponDiscount(
  discountType: CouponEnum,
  discount: number,
  bookingAmount: number,
): CouponDiscountResult {
  let discountAmount = 0;

  if (discountType === CouponEnum.percentage) {
    discountAmount = (bookingAmount * discount) / 100;
  } else if (discountType === CouponEnum.fixed) {
    discountAmount = discount;
  }

  discountAmount = Math.min(discountAmount, bookingAmount);
  const finalPrice = Math.max(0, bookingAmount - discountAmount);

  return {
    discountAmount: Number(discountAmount.toFixed(2)),
    finalPrice: Number(finalPrice.toFixed(2)),
  };
}
