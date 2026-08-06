import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, ValidateNested,
} from 'class-validator';
import { ParseArray, ParseBoolean, ParseByJson } from 'src/common/decorator/transform.decorator';

export class CustomHourPriceDto {
  @IsNumber()
  @Type(() => Number)
  hour: number;

  @IsNumber()
  @Type(() => Number)
  pricePerHour: number;
}

export class CreateVenueDto {
  @IsNotEmpty()
  @IsString()
  venueName: string;

  @IsNotEmpty()
  @IsString()
  address: string;

  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  @ParseArray()
  sportsType: string[];

  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  locationAlt: number;

  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  locationLang: number;

  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  @ParseArray()
  amenities: string[];

  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  startWorkingHours: number;

  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  endWorkingHours: number;

  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  defaultHourPrice: number;

  @IsOptional()
  @IsArray()
  @ParseByJson()
  @Type(() => CustomHourPriceDto)
  @ValidateNested({ each: true })
  customHourPrices?: CustomHourPriceDto[];

  @IsOptional()
  @ParseBoolean()
  @IsBoolean()
  isActive?: boolean;
}
