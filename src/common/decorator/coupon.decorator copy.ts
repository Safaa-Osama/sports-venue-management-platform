import { registerDecorator, ValidationOptions, ValidationArguments, ValidatorConstraintInterface } from "class-validator";


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


export function isDateAfter(reqFields: string[], validationOptions?: ValidationOptions) {
    return function (constructor: Function) {
        registerDecorator({
            target: constructor,
            propertyName: '',
            options: validationOptions,
            constraints: reqFields,
            validator: matchDate   
        });

    };

}