import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Validate,
} from 'class-validator';
import { AtLeastOne } from 'src/common/decorator/AtLeastOne.decorator';
import {
  isDateAfter,
  discountValidation,
} from 'src/common/decorator/coupon.decorator';
import { CouponEnum } from 'src/common/enums/couponEnum';

export class CreateCouponDto {
  @ApiProperty({
    description: 'Unique uppercase discount coupon code',
    example: 'SUMMER2026',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    description: 'Type of discount applied (percentage or fixed amount)',
    enum: CouponEnum,
    example: CouponEnum.percentage,
  })
  @IsEnum(CouponEnum)
  @IsNotEmpty()
  discountType: CouponEnum;

  @ApiProperty({
    description: 'Discount amount or percentage (e.g. 15 for 15% or 50 for 50 EGP)',
    example: 20,
  })
  @IsNumber()
  @IsNotEmpty()
  @Validate(discountValidation)
  discount: number;

  @ApiProperty({
    description: 'Coupon validity start timestamp (ISO Date format)',
    example: '2026-06-01T00:00:00.000Z',
  })
  @IsDate()
  @IsNotEmpty()
  @Type(() => Date)
  @Validate(isDateAfter)
  startDate: Date;

  @ApiProperty({
    description: 'Coupon expiration timestamp (must be strictly after startDate)',
    example: '2026-09-01T23:59:59.000Z',
  })
  @IsDate()
  @IsNotEmpty()
  @Type(() => Date)
  @Validate(isDateAfter, ['startDate'])
  endDate: Date;

  @ApiPropertyOptional({
    description: 'Maximum total redemptions permitted across all users',
    example: 100,
  })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  maxUses?: number;

  @ApiPropertyOptional({
    description: 'Current count of coupon redemptions',
    default: 0,
    example: 0,
  })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  usesCount?: number;

  @ApiPropertyOptional({
    description: 'Whether the coupon is enabled and active',
    default: true,
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

@AtLeastOne(['code', 'discount', 'startDate', 'endDate'])
export class UpdateCouponDto extends PartialType(CreateCouponDto) {}

export class ValidateCouponDto {
  @ApiProperty({
    description: 'Coupon code to test',
    example: 'SUMMER2026',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    description: 'Total booking order amount prior to discount (used to calculate percentage discount and verify eligibility)',
    example: 500,
  })
  @IsNumber()
  @IsPositive()
  @IsNotEmpty()
  bookingAmount: number;
}
