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
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { AtLeastOne } from 'src/common/decorator/AtLeastOne.decorator';
import {
  ParseArray,
  ParseBoolean,
  ParseByJson,
} from 'src/common/decorator/transform.decorator';

export class CustomHourPriceDto {
  @ApiPropertyOptional({
    description: 'Optional ID for custom hour price',
    example: 'custom-hour-1',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    description: 'Optional MongoDB _id for custom hour price',
  })
  @IsOptional()
  @IsString()
  _id?: string;

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

  @ApiPropertyOptional({
    description: 'Optional label for custom hour price',
  })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({
    description: 'Optional start hour string format',
  })
  @IsOptional()
  @IsString()
  startHour?: string;

  @ApiPropertyOptional({
    description: 'Optional end hour string format',
  })
  @IsOptional()
  @IsString()
  endHour?: string;
}

export class CustomDatePriceDto {
  @ApiPropertyOptional({
    description: 'Optional ID for custom date price item',
    example: 'custom-date-1',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    description: 'Optional MongoDB _id for custom date price item',
  })
  @IsOptional()
  @IsString()
  _id?: string;

  @ApiProperty({
    description: 'Specific date for the custom price in YYYY-MM-DD format',
    example: '2026-08-31',
  })
  @IsString()
  date: string;

  @ApiProperty({
    description: 'Start hour of the custom pricing window (0 to 23)',
    example: 20,
    minimum: 0,
    maximum: 23,
  })
  @IsNumber()
  @Min(0)
  @Max(23)
  @Type(() => Number)
  startHour: number;

  @ApiProperty({
    description: 'End hour of the custom pricing window (1 to 24)',
    example: 24,
    minimum: 1,
    maximum: 24,
  })
  @IsNumber()
  @Min(1)
  @Max(24)
  @Type(() => Number)
  endHour: number;

  @ApiProperty({
    description: 'Custom price per hour during this specific date window',
    example: 350,
  })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  pricePerHour: number;

  @ApiPropertyOptional({
    description: 'Optional note or event title for this date pricing rule',
    example: 'Holiday Match',
  })
  @IsOptional()
  @IsString()
  note?: string;
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
  @Min(0)
  @Max(23)
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
  @Min(1)
  @Max(24)
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
    description: 'Date-specific custom pricing rules (JSON array or string)',
    type: [CustomDatePriceDto],
    example: [
      { date: '2026-08-31', startHour: 20, endHour: 24, pricePerHour: 350, note: 'Special Event' },
    ],
  })
  @IsOptional()
  @IsArray()
  @ParseByJson(CustomDatePriceDto)
  @Type(() => CustomDatePriceDto)
  @ValidateNested({ each: true })
  customDatePrices?: CustomDatePriceDto[];

  @ApiPropertyOptional({
    description: 'Minimum deposit required per slot in EGP (0 for full payment)',
    example: 50,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minimumDepositAmount?: number;

  @ApiPropertyOptional({
    description: 'Array or JSON string of existing image URLs / S3 keys',
    type: [String],
  })
  @IsOptional()
  @ParseArray()
  @IsArray()
  @IsString({ each: true })
  existingImages?: string[];

  @ApiPropertyOptional({
    description: 'Array or JSON string of existing image URLs / S3 keys to retain',
    type: [String],
  })
  @IsOptional()
  @ParseArray()
  @IsArray()
  @IsString({ each: true })
  keepImages?: string[];

  @ApiPropertyOptional({
    description: 'Array or JSON string of image URLs / S3 keys to delete',
    type: [String],
  })
  @IsOptional()
  @ParseArray()
  @IsArray()
  @IsString({ each: true })
  removedImages?: string[];

  @ApiPropertyOptional({
    description: 'Array or JSON string of image URLs / S3 keys to delete',
    type: [String],
  })
  @IsOptional()
  @ParseArray()
  @IsArray()
  @IsString({ each: true })
  deleteImages?: string[];

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
  'customDatePrices',
  'minimumDepositAmount',
  'isActive',
  'existingImages',
  'keepImages',
  'removedImages',
  'deleteImages',
])
export class UpdateVenueDto extends PartialType(CreateVenueDto) {
  @ApiPropertyOptional({
    description: 'Array or JSON string of existing image URLs / S3 keys to retain',
    type: [String],
  })
  @IsOptional()
  @ParseArray()
  @IsArray()
  @IsString({ each: true })
  existingImages?: string[];

  @ApiPropertyOptional({
    description: 'Array or JSON string of existing image URLs / S3 keys to retain',
    type: [String],
  })
  @IsOptional()
  @ParseArray()
  @IsArray()
  @IsString({ each: true })
  keepImages?: string[];

  @ApiPropertyOptional({
    description: 'Array or JSON string of image URLs / S3 keys to delete from storage',
    type: [String],
  })
  @IsOptional()
  @ParseArray()
  @IsArray()
  @IsString({ each: true })
  removedImages?: string[];

  @ApiPropertyOptional({
    description: 'Array or JSON string of image URLs / S3 keys to delete from storage',
    type: [String],
  })
  @IsOptional()
  @ParseArray()
  @IsArray()
  @IsString({ each: true })
  deleteImages?: string[];
}
export { UpdateVenueDto as UpdateteVenueDto };

