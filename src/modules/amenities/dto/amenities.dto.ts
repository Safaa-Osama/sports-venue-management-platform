import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsMongoId, IsNotEmpty, IsOptional } from 'class-validator';
import { AtLeastOne } from 'src/common/decorator/AtLeastOne.decorator';

export class CreateAmenitiesDto {
  @IsMongoId()
  @IsNotEmpty()
  venueId: string;

  @IsBoolean()
  @IsOptional()
  Parking?: boolean;

  @IsBoolean()
  @IsOptional()
  Cafeteria?: boolean;

  @IsBoolean()
  @IsOptional()
  Shower?: boolean;

  @IsBoolean()
  @IsOptional()
  ChangingRoom?: boolean;

  @IsBoolean()
  @IsOptional()
  Toilets?: boolean;

  @IsBoolean()
  @IsOptional()
  WiFi?: boolean;

  @IsBoolean()
  @IsOptional()
  Lockers?: boolean;

  @IsBoolean()
  @IsOptional()
  FloodLights?: boolean;

  @IsBoolean()
  @IsOptional()
  DrinkingWater?: boolean;

  @IsBoolean()
  @IsOptional()
  FirstAid?: boolean;

  @IsBoolean()
  @IsOptional()
  PrayerArea?: boolean;

  @IsBoolean()
  @IsOptional()
  EquipmentRental?: boolean;
}


@AtLeastOne([ 'Parking', 'Cafeteria', 'Shower', 'ChangingRoom', 'Toilets', 'WiFi', 'Lockers', 'FloodLights', 'DrinkingWater', 'FirstAid', 'PrayerArea', 'EquipmentRental'])
export class UpdateAmenitiesDto extends PartialType(CreateAmenitiesDto) {
}