import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { CouponEnum } from '../enums/couponEnum';

export class matchDate implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    const obj = args.object as any;
    const startDate = new Date(obj.startDate);
    const endDate = new Date(obj.endDate);
    const currentDate = new Date();
    return startDate < endDate && currentDate < startDate;
  }
  defaultMessage(args: ValidationArguments) {
    return `startDate must be after currentDate and endDate must be after startDate`;
  }
}

export function isDateAfter(
  reqFields: string[],
  validationOptions?: ValidationOptions,
) {
  return function (constructor: Function) {
    registerDecorator({
      target: constructor,
      propertyName: '',
      options: validationOptions,
      constraints: reqFields,
      validator: matchDate,
    });
  };
}

@ValidatorConstraint({ name: 'discountValidation', async: false })
export class discountValidation implements ValidatorConstraintInterface {
  validate(value: number, args: ValidationArguments) {
    const obj = args.object as any;
    const discountType = obj.discountType;

    if (discountType === CouponEnum.percentage) {
      return value >= 1 && value <= 100;
    }
    if (discountType === CouponEnum.fixed) {
      return value > 0;
    }
    return true;
  }

  defaultMessage(args: ValidationArguments) {
    const obj = args.object as any;
    if (obj.discountType === CouponEnum.percentage) {
      return 'Percentage discount must be between 1% and 100%';
    }
    if (obj.discountType === CouponEnum.fixed) {
      return 'Fixed discount must be a positive number greater than 0';
    }
    return 'Invalid discount value for the selected discount type';
  }
}

export function isDiscountValid(
  reqFields: string[],
  validationOptions?: ValidationOptions,
) {
  return function (constructor: Function) {
    registerDecorator({
      target: constructor,
      propertyName: '',
      options: validationOptions,
      constraints: reqFields,
      validator: discountValidation,
    });
  };
}
