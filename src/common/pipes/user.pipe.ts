import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, registerDecorator, ValidationOptions, } from 'class-validator';

@ValidatorConstraint({ name: 'matchText', async: false })
export class matchText implements ValidatorConstraintInterface {
    validate(value: string, args: ValidationArguments) {
        return value == args.object[args.constraints[0]];
    }

    defaultMessage(args: ValidationArguments) {
        return `${args.property} doesn't match the ${args.constraints[0]}`;
    }
}

export function IsMatch(constraints: string[], validationOptions?: ValidationOptions) {

    return function (object: object, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            constraints, 
            validator: matchText,
        });
    };
}
