import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  BookingStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
} from 'src/common/enums/bookingEnum';


@ValidatorConstraint({ name: 'isGreaterThan', async: false })
export class IsGreaterThanConstraint implements ValidatorConstraintInterface {
  validate(propertyValue: any, args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    const relatedValue = (args.object as any)[relatedPropertyName];
    if (propertyValue === undefined || relatedValue === undefined) {
      return true;
    }
    return (
      typeof propertyValue === 'number' &&
      typeof relatedValue === 'number' &&
      propertyValue > relatedValue
    );
  }

  defaultMessage(args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    return `${args.property} must be strictly greater than ${relatedPropertyName}`;
  }
}

export function IsGreaterThan(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [property],
      validator: IsGreaterThanConstraint,
    });
  };
}

export class BookingSlotDto {
  @ApiProperty({
    description: 'Start slot hour in 24h format (0 to 23)',
    example: 18,
    minimum: 0,
    maximum: 23,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  @IsNotEmpty()
  startTime: number;

  @ApiProperty({
    description: 'End slot hour in 24h format (1 to 24; must be > startTime)',
    example: 19,
    minimum: 1,
    maximum: 24,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  @IsNotEmpty()
  @IsGreaterThan('startTime', {
    message: 'endTime must be greater than startTime',
  })
  endTime: number;
}

export class CreateBookingDto {
  @ApiProperty({
    description: 'MongoDB ObjectId of the sports venue to reserve',
    example: '64e8b0a1f2b4c10012345678',
  })
  @IsMongoId()
  @IsNotEmpty()
  venueId: string;

  @ApiPropertyOptional({
    description: 'Optional customer ID for admin creating a booking on behalf of a user',
    example: '64e8b0a1f2b4c10012345678',
  })
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @ApiProperty({
    description: 'Booking date in ISO string format (YYYY-MM-DD)',
    example: '2026-08-20',
  })
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiPropertyOptional({
    description: 'Array of time slots to book in a single reservation session',
    type: [BookingSlotDto],
    example: [
      { startTime: 18, endTime: 19 },
      { startTime: 20, endTime: 21 },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingSlotDto)
  slots?: BookingSlotDto[];

  @ApiPropertyOptional({
    description: 'Start slot hour in 24h format (0 to 23) (legacy single slot)',
    example: 18,
    minimum: 0,
    maximum: 23,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  startTime?: number;

  @ApiPropertyOptional({
    description: 'End slot hour in 24h format (1 to 24; must be > startTime) (legacy single slot)',
    example: 20,
    minimum: 1,
    maximum: 24,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  @IsGreaterThan('startTime', {
    message: 'endTime must be greater than startTime',
  })
  endTime?: number;

  @ApiPropertyOptional({
    description: 'Optional promotional coupon code for discount',
    example: 'SUMMER2026',
  })
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiPropertyOptional({
    description: 'Unique client-generated idempotency key (prevents double charging on retry)',
    example: 'c6a3809e-7bd0-42cf-8d13-d3c52e72bc7b',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiProperty({
    description: 'Payment method chosen for the reservation',
    enum: PaymentMethodEnum,
    example: PaymentMethodEnum.wallet,
  })
  @IsEnum(PaymentMethodEnum)
  @IsNotEmpty()
  paymentMethod: PaymentMethodEnum;
}

export class CreatePaymentDto {
  @ApiProperty({
    description: 'Payment method for paying an existing pending booking',
    enum: PaymentMethodEnum,
    example: PaymentMethodEnum.wallet,
  })
  @IsEnum(PaymentMethodEnum)
  @IsNotEmpty()
  paymentMethod: PaymentMethodEnum;

  @ApiPropertyOptional({
    description: 'Optional promotional coupon code',
    example: 'SUMMER2026',
  })
  @IsOptional()
  @IsString()
  couponCode?: string;
}

export class QueryBookingDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination',
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of booking records per page',
    default: 10,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Filter bookings by lifecycle status',
    enum: BookingStatusEnum,
    example: BookingStatusEnum.confirmed,
  })
  @IsOptional()
  @IsEnum(BookingStatusEnum)
  status?: BookingStatusEnum;

  @ApiPropertyOptional({
    description: 'Filter bookings by payment status',
    enum: PaymentStatusEnum,
    example: PaymentStatusEnum.paid,
  })
  @IsOptional()
  @IsEnum(PaymentStatusEnum)
  paymentStatus?: PaymentStatusEnum;

  @ApiPropertyOptional({
    description: 'Filter bookings by date (YYYY-MM-DD)',
    example: '2026-08-20',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;
}

export class UpdateBookingStatusDto {
  @ApiPropertyOptional({
    description: 'Update booking status',
    enum: BookingStatusEnum,
    example: BookingStatusEnum.completed,
  })
  @IsOptional()
  @IsEnum(BookingStatusEnum)
  status?: BookingStatusEnum;

  @ApiPropertyOptional({
    description: 'Update payment status',
    enum: PaymentStatusEnum,
    example: PaymentStatusEnum.paid,
  })
  @IsOptional()
  @IsEnum(PaymentStatusEnum)
  paymentStatus?: PaymentStatusEnum;
}
