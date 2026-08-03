import { registerDecorator, ValidationOptions, ValidationArguments, ValidatorConstraintInterface } from "class-validator";


export class matchVAlue implements ValidatorConstraintInterface {
    validate(value: any, args: ValidationArguments) {
        const fields = args.constraints as string[];
        return fields.some(field => args.object[field]);
    }
    defaultMessage(args: ValidationArguments) {
        return `At least one of the fields ${args.constraints.join(', ')} is required`;
    }
}


export function AtLeastOne(reqFields: string[], validationOptions?: ValidationOptions) {
    return function (constructor: Function) {
        registerDecorator({
            target: constructor,
            propertyName: '',
            options: validationOptions,
            constraints: reqFields,
            validator: matchVAlue
        });

    };

}