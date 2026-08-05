import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";
import { IsNotEmpty } from "class-validator";

export class CreateVenueDto {
    @IsNotEmpty()
    @IsString()
    venueName: string;

    @IsNotEmpty()
    @IsString()
    address: string;

    @IsNotEmpty()
    @IsString()
    sportsType: [string];

    @IsNotEmpty()
    @IsNumber()
    locationAlt: number;

    @IsNotEmpty()
    @IsNumber()
    locationLang: number;

    @IsNotEmpty()
    @IsArray()
    images: string[];

    @IsNotEmpty()
    @IsArray()
    amenities: string[];

    @IsNotEmpty()
    @IsNumber()
    startWorkingHours: number;

    @IsNotEmpty()
    @IsNumber()
    endWorkingHours: number;

    @IsNotEmpty()
    @IsNumber()
    defaultHourPrice: number;

    @IsOptional()
    @IsArray()
    customHourPrices: { hour: number; pricePerHour: number }[];

    @IsOptional()
    @IsBoolean()
    isActive: boolean;
}
