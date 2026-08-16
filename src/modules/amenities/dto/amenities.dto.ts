import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsMongoId, IsNotEmpty, IsOptional } from 'class-validator';
import { AtLeastOne } from 'src/common/decorator/AtLeastOne.decorator';

export class CreateAmenitiesDto {
  @ApiProperty({
    description: 'MongoDB ObjectId of the associated venue',
    example: '64e8b0a1f2b4c10012345678',
  })
  @IsMongoId()
  @IsNotEmpty()
  venueId: string;

  @ApiPropertyOptional({ description: 'On-site vehicle parking availability', default: false, example: true })
  @IsBoolean()
  @IsOptional()
  Parking?: boolean;

  @ApiPropertyOptional({ description: 'Cafeteria / snack bar availability', default: false, example: true })
  @IsBoolean()
  @IsOptional()
  Cafeteria?: boolean;

  @ApiPropertyOptional({ description: 'Showers availability', default: false, example: true })
  @IsBoolean()
  @IsOptional()
  Shower?: boolean;

  @ApiPropertyOptional({ description: 'Changing rooms availability', default: false, example: true })
  @IsBoolean()
  @IsOptional()
  ChangingRoom?: boolean;

  @ApiPropertyOptional({ description: 'Toilets / Restrooms availability', default: false, example: true })
  @IsBoolean()
  @IsOptional()
  Toilets?: boolean;

  @ApiPropertyOptional({ description: 'High-speed guest WiFi availability', default: false, example: true })
  @IsBoolean()
  @IsOptional()
  WiFi?: boolean;

  @ApiPropertyOptional({ description: 'Secure lockers availability', default: false, example: true })
  @IsBoolean()
  @IsOptional()
  Lockers?: boolean;

  @ApiPropertyOptional({ description: 'Stadium floodlights for night games', default: false, example: true })
  @IsBoolean()
  @IsOptional()
  FloodLights?: boolean;

  @ApiPropertyOptional({ description: 'Drinking water stations availability', default: false, example: true })
  @IsBoolean()
  @IsOptional()
  DrinkingWater?: boolean;

  @ApiPropertyOptional({ description: 'First aid medical kit on premise', default: false, example: true })
  @IsBoolean()
  @IsOptional()
  FirstAid?: boolean;

  @ApiPropertyOptional({ description: 'Prayer room / area availability', default: false, example: true })
  @IsBoolean()
  @IsOptional()
  PrayerArea?: boolean;

  @ApiPropertyOptional({ description: 'Sports equipment rental service (balls, rackets, bibs)', default: false, example: true })
  @IsBoolean()
  @IsOptional()
  EquipmentRental?: boolean;
}

@AtLeastOne([
  'Parking',
  'Cafeteria',
  'Shower',
  'ChangingRoom',
  'Toilets',
  'WiFi',
  'Lockers',
  'FloodLights',
  'DrinkingWater',
  'FirstAid',
  'PrayerArea',
  'EquipmentRental',
])
export class UpdateAmenitiesDto extends PartialType(CreateAmenitiesDto) {}
