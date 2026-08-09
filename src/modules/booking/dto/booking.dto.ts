import { Type } from 'class-transformer';
import { IsDate, IsDateString, IsEnum, IsInt, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, Validate, validate } from 'class-validator';
import { isDateAfter } from 'src/common/decorator/coupon.decorator';
import { BookingStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from 'src/common/enums/bookingEnum';

export class CreateBookingDto {
  @IsMongoId()
  @IsNotEmpty()
  venueId: string;

  @IsDateString()
  @IsNotEmpty()
  date: string;

  @IsNumber()
  @IsNotEmpty()
  @Validate(isDateAfter)
  startTime: number;

  @IsNumber()
  @IsNotEmpty()
  @Validate(isDateAfter, ["startTime"])
  endTime: number;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsEnum(PaymentMethodEnum)
  paymentMethod?: PaymentMethodEnum;
}

export class PayBookingDto {
  @IsEnum(PaymentMethodEnum)
  @IsNotEmpty()
  paymentMethod: PaymentMethodEnum;

  @IsOptional()
  @IsString()
  couponCode?: string;
}

export class QueryBookingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(BookingStatusEnum)
  status?: BookingStatusEnum;

  @IsOptional()
  @IsEnum(PaymentStatusEnum)
  paymentStatus?: PaymentStatusEnum;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;
}

export class UpdateBookingStatusDto {
  @IsOptional()
  @IsEnum(BookingStatusEnum)
  status?: BookingStatusEnum;

  @IsOptional()
  @IsEnum(PaymentStatusEnum)
  paymentStatus?: PaymentStatusEnum;
}