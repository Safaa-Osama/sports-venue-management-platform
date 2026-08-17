import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { AtLeastOne } from 'src/common/decorator/AtLeastOne.decorator';
import {
  ParseArray,
  ParseBoolean,
  ParseByJson,
} from 'src/common/decorator/transform.decorator';

export class CustomHourPriceDto {
  @ApiProperty({
    description: 'Specific hour of the day in 24h format (0 to 23)',
    example: 20,
    minimum: 0,
    maximum: 23,
  })
  @IsNumber()
  @Type(() => Number)
  hour: number;

  @ApiProperty({
    description: 'Custom price per hour for this specific peak/off-peak hour',
    example: 350,
  })
  @IsNumber()
  @Type(() => Number)
  pricePerHour: number;
}

export class CreateVenueDto {
  @ApiProperty({
    description: 'Name of the sports venue / stadium',
    example: 'Camp Nou Arena',
  })
  @IsNotEmpty()
  @IsString()
  venueName: string;

  @ApiProperty({
    description: 'Physical address of the venue',
    example: '123 Stadium Road, District 5, Cairo',
  })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiProperty({
    description: 'List of sports supported at this venue',
    example: ['Football', 'Padel', 'Basketball'],
    type: [String],
  })
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  @ParseArray()
  sportsType: string[];

  @ApiProperty({
    description: 'Latitude coordinate of the venue',
    example: 30.0444,
  })
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  locationAlt: number;

  @ApiProperty({
    description: 'Longitude coordinate of the venue',
    example: 31.2357,
  })
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  locationLang: number;

  @ApiProperty({
    description: 'List of amenities / features available at the venue',
    example: ['Parking', 'Shower', 'WiFi', 'FloodLights'],
    type: [String],
  })
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  @ParseArray()
  amenities: string[];

  @ApiProperty({
    description: 'Opening / start working hour in 24h format (0 to 23)',
    example: 8,
    minimum: 0,
    maximum: 23,
  })
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  startWorkingHours: number;

  @ApiProperty({
    description: 'Closing / end working hour in 24h format (1 to 24)',
    example: 24,
    minimum: 1,
    maximum: 24,
  })
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  endWorkingHours: number;

  @ApiProperty({
    description: 'Standard / base price per hour',
    example: 250,
  })
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  defaultHourPrice: number;

  @ApiPropertyOptional({
    description: 'Special custom pricing for specific peak/off-peak hours (JSON array or string)',
    type: [CustomHourPriceDto],
    example: [
      { hour: 18, pricePerHour: 300 },
      { hour: 19, pricePerHour: 350 },
      { hour: 20, pricePerHour: 350 },
    ],
  })
  @IsOptional()
  @IsArray()
  @ParseByJson(CustomHourPriceDto)
  @Type(() => CustomHourPriceDto)
  @ValidateNested({ each: true })
  customHourPrices?: CustomHourPriceDto[];

  @ApiPropertyOptional({
    description: 'Whether the venue is currently active and open for booking',
    default: true,
    example: true,
  })
  @IsOptional()
  @ParseBoolean()
  @IsBoolean()
  isActive?: boolean;
}

export class GetVenuesQueryDto {
  @ApiPropertyOptional({
    description: 'Filter active venues by sport type (e.g. Football, Padel, Basketball)',
    example: 'Football',
  })
  @IsOptional()
  @IsString()
  sportsType?: string;
}

@AtLeastOne([
  'venueName',
  'address',
  'sportsType',
  'locationAlt',
  'locationLang',
  'amenities',
  'startWorkingHours',
  'endWorkingHours',
  'defaultHourPrice',
  'customHourPrices',
  'isActive',
])
export class UpdateVenueDto extends PartialType(CreateVenueDto) {}
export { UpdateVenueDto as UpdateteVenueDto };

