import { PartialType } from "@nestjs/mapped-types";
import { Type } from "class-transformer";
import { IsBoolean, IsDate, IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, Min, Validate } from "class-validator";
import { AtLeastOne } from "src/common/decorator/AtLeastOne.decorator";
import { isDateAfter } from "src/common/decorator/coupon.decorator";
import { CouponEnum } from "src/common/enums/couponEnum";

export class CreateCouponDto {
    @IsString()
    @IsNotEmpty()
    code: string;

    @IsEnum(CouponEnum)
    @IsNotEmpty()
    discountType: CouponEnum;

    @IsNumber()
    @IsPositive()
    @IsNotEmpty()
    @Min(1, { message: 'Discount must be at least 1%' })
    @Max(100, { message: 'Discount cannot exceed 100%' })
    discount: number;

    @IsDate()
    @IsNotEmpty()
    @Type(() => Date)
    @Validate(isDateAfter)
    startDate: Date;

    @IsDate()
    @IsNotEmpty()
    @Type(() => Date)
    @Validate(isDateAfter, ["startDate"])
    endDate: Date;

    @IsNumber()
    @IsPositive()
    @IsOptional()
    maxUses: number;

    @IsNumber()
    @IsPositive()
    @IsOptional()
    usesCount: number;

    @IsBoolean()
    @IsOptional()
    isActive: boolean;
}

@AtLeastOne(['code', 'discount', 'startDate', 'endDate'])
export class UpdateCouponDto extends PartialType(CreateCouponDto) {
}


export class ValidateCouponDto {
    @IsString()
    @IsNotEmpty()
    code: string;

    @IsNumber()
    @IsPositive()
    @IsNotEmpty()
    bookingAmount: number;
}

