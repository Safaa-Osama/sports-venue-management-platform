import { Type } from 'class-transformer';
import {
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
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { BookingStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from 'src/common/enums/bookingEnum';

@ValidatorConstraint({ name: 'isGreaterThan', async: false })
export class IsGreaterThanConstraint implements ValidatorConstraintInterface {
  validate(propertyValue: any, args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    const relatedValue = (args.object as any)[relatedPropertyName];
    return typeof propertyValue === 'number' && typeof relatedValue === 'number' && propertyValue > relatedValue;
  }

  defaultMessage(args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    return `${args.property} must be strictly greater than ${relatedPropertyName}`;
  }
}

export function IsGreaterThan(property: string, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [property],
      validator: IsGreaterThanConstraint,
    });
  };
}

export class CreateBookingDto {
  @IsMongoId()
  @IsNotEmpty()
  venueId: string;

  @IsDateString()
  @IsNotEmpty()
  date: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  @IsNotEmpty()
  startTime: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  @IsNotEmpty()
  @IsGreaterThan('startTime', { message: 'endTime must be greater than startTime' })
  endTime: number;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsEnum(PaymentMethodEnum)
  @IsNotEmpty()
  paymentMethod: PaymentMethodEnum;
}

export class CreatePaymentDto {
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